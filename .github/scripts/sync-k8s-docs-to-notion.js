const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Client } = require("@notionhq/client");

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const DATABASE_ID = process.env.NOTION_CODE_DATABASE_ID;
const RICH_TEXT_LIMIT = 1900;

const targets = [
  {
    title: "(Github)설치/구성",
    category: "설치/구성",
    filePath: "docs/install_configuration.md",
    language: "markdown",
  },
  {
    title: "(Github)활용 스크립트",
    category: "활용 스크립트",
    filePath: "docs/scripts.md",
    language: "markdown",
  },
  {
    title: "(Github)트러블슈팅",
    category: "트러블슈팅",
    filePath: "docs/troubleshooting.md",
    language: "markdown",
  },
];

function splitText(text, size) {
  const chunks = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

function getCommitAuthor() {
  try {
    return execSync("git log -1 --format=%an").toString().trim();
  } catch {
    return process.env.GITHUB_ACTOR || "GitHub Actions";
  }
}

function getCommitDate() {
  try {
    return execSync("git log -1 --format=%cI").toString().trim();
  } catch {
    return new Date().toISOString();
  }
}

async function findTargetPage(target) {
  const result = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        {
          property: "문서명",
          title: {
            equals: target.title,
          },
        },
        {
          property: "구분",
          select: {
            equals: target.category,
          },
        },
      ],
    },
    page_size: 1,
  });

  return result.results[0];
}

async function getAllChildBlocks(pageId) {
  const blocks = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });

    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function clearPage(pageId) {
  const blocks = await getAllChildBlocks(pageId);

  for (const block of blocks) {
    await notion.blocks.update({
      block_id: block.id,
      archived: true,
    });
  }
}

async function appendCodeBlock(pageId, target, content) {
  const now = new Date().toISOString();
  const chunks = splitText(content, RICH_TEXT_LIMIT);

  await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  `GitHub에서 자동 동기화됨\n` +
                  `File: ${target.filePath}\n` +
                  `Repository: ${process.env.GITHUB_REPOSITORY || ""}\n` +
                  `SHA: ${process.env.GITHUB_SHA || ""}\n` +
                  `Last synced: ${now}`,
              },
            },
          ],
        },
      },
      {
        object: "block",
        type: "code",
        code: {
          language: target.language,
          rich_text: chunks.map((chunk) => ({
            type: "text",
            text: {
              content: chunk,
            },
          })),
        },
      },
    ],
  });
}

async function createTargetPage(target, author, commitDate) {
  const page = await notion.pages.create({
    parent: {
      database_id: DATABASE_ID,
    },
    properties: {
      문서명: {
        title: [
          {
            text: {
              content: target.title,
            },
          },
        ],
      },
      구분: {
        select: {
          name: target.category,
        },
      },
      편집자: {
        rich_text: [
          {
            text: {
              content: author,
            },
          },
        ],
      },
      등록일: {
        date: {
          start: commitDate,
        },
      },
      "최종 편집 일시": {
        date: {
          start: new Date().toISOString(),
        },
      },
    },
  });

  return page;
}

async function updateTargetPage(pageId, target, author) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      문서명: {
        title: [
          {
            text: {
              content: target.title,
            },
          },
        ],
      },
      구분: {
        select: {
          name: target.category,
        },
      },
      편집자: {
        rich_text: [
          {
            text: {
              content: author,
            },
          },
        ],
      },
      "최종 편집 일시": {
        date: {
          start: new Date().toISOString(),
        },
      },
    },
  });
}

async function syncTarget(target) {
  const filePath = path.join(process.cwd(), target.filePath);

  if (!fs.existsSync(filePath)) {
    console.log(`Skipped. File not found: ${target.filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const author = getCommitAuthor();
  const commitDate = getCommitDate();

  let page = await findTargetPage(target);

  if (!page) {
    page = await createTargetPage(target, author, commitDate);
    console.log(`Created Notion page: ${target.title}`);
  } else {
    await updateTargetPage(page.id, target, author);
    console.log(`Updated Notion page: ${target.title}`);
  }

  await clearPage(page.id);
  await appendCodeBlock(page.id, target, content);

  console.log(`Synced ${target.filePath} to ${target.title}`);
}

async function main() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is missing");
  }

  if (!DATABASE_ID) {
    throw new Error("NOTION_CODE_DATABASE_ID is missing");
  }

  for (const target of targets) {
    await syncTarget(target);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});