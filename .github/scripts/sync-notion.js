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

async function main() {
  const { type, item, githubId, state } = getItem();

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