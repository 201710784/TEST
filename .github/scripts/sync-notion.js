const fs = require("fs");
const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const eventName = process.env.GITHUB_EVENT_NAME;
const repo = process.env.GITHUB_REPOSITORY;

function getItem() {
  if (eventName === "issues") {
    return {
      type: "Issue",
      item: event.issue,
      githubId: `issue:${repo}#${event.issue.number}`,
      state: event.issue.state,
    };
  }

  if (eventName === "issue_comment") {
    return {
      type: "Issue",
      item: event.issue,
      githubId: `issue:${repo}#${event.issue.number}`,
      state: event.issue.state,
    };
  }

  if (eventName === "pull_request") {
    const pr = event.pull_request;

    return {
      type: "PR",
      item: pr,
      githubId: `pr:${repo}#${pr.number}`,
      state: pr.merged ? "merged" : pr.state,
    };
  }

  throw new Error(`Unsupported event: ${eventName}`);
}

async function fetchFreshIssue(number) {
  const [owner, repoName] = repo.split("/");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues/${number}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function findExistingPage(githubId) {
	const result = await notion.databases.query({
	database_id: databaseId,
	filter: {
		property: "GitHub ID",
		rich_text: {
		equals: githubId,
		},
	},
	});

  return result.results[0];
}

//commit 상세 조회 함수 추가
async function fetchCommitDetail(sha) {
  const [owner, repoName] = repo.split("/");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/commits/${sha}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub Commit API failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function createCommitRecord() {
const commit = event.head_commit;
const commitDetail = await fetchCommitDetail(commit.id);

const filesChanged = (commitDetail.files || [])
  .map(file => `${file.status} ${file.filename}`)
  .join("\n");

  await notion.pages.create({
    parent: {
      database_id: process.env.NOTION_COMMITS_DATABASE_ID,
    },

    properties: {
      "Commit Message": {
        title: [
          {
            text: {
              content: commit.message.split("\n")[0],
            },
          },
        ],
      },

      SHA: {
        rich_text: [
          {
            text: {
              content: commit.id,
            },
          },
        ],
      },

      Repo: {
        rich_text: [
          {
            text: {
              content: repo,
            },
          },
        ],
      },

      Branch: {
        rich_text: [
          {
            text: {
              content: event.ref.replace(
                "refs/heads/",
                ""
              ),
            },
          },
        ],
      },

      작성자: {
        rich_text: [
          {
            text: {
              content:
                commit.author?.username ||
                commit.author?.name ||
                "",
            },
          },
        ],
      },

      URL: {
        url: commit.url,
      },

      Timestamp: {
        date: {
          start: commit.timestamp,
        },
      },
	  
	  "Files Changed": {
		rich_text: [
		 {
			text: {
			 content: filesChanged || "No file changes",
			},
		 },
		],
	  },
    },
  });
}

async function main() {

  if (eventName === "push") {
  await createCommitRecord();
  return;
  }

  let { type, item, githubId, state } = getItem();
  
  if (eventName === "issue_comment") {
  item = await fetchFreshIssue(item.number);
  state = item.state;
  }
  
  const properties = {
    이름: {
      title: [
        {
          text: {
            content: item.title || "(no title)",
          },
        },
      ],
    },
    "GitHub ID": {
      rich_text: [
        {
          text: {
            content: githubId,
          },
        },
      ],
    },
    유형: {
      select: {
        name: type,
      },
    },
    상태: {
      select: {
        name: state,
      },
    },
    URL: {
      url: item.html_url,
    },
    Repo: {
      rich_text: [
        {
          text: {
            content: repo,
          },
        },
      ],
    },
	작성자: {
	rich_text: [
		{
		text: {
			content: item.user?.login || "",
		},
		},
	],
	},
	라벨: {
	multi_select: (item.labels || []).map(label => ({
		name: label.name,
	})),
	},
	"Created At": {
	date: item.created_at
		? { start: item.created_at }
		: null,
	},
	"Updated At": {
	date: item.updated_at
		? { start: item.updated_at }
		: null,
	},
	댓글수: {
	number: item.comments || 0,
	},
	"Number": {
	number: item.number,
	},
  };

  const existing = await findExistingPage(githubId);

  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties,
    });

    console.log(`Updated: ${githubId}`);
  } else {
    await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties,
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: item.body || "No description",
                },
              },
            ],
          },
        },
      ],
    });

    console.log(`Created: ${githubId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});