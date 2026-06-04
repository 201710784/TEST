const fs = require("fs");
const path = require("path");
const { Client } = require("@notionhq/client");

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const PAGE_ID = process.env.NOTION_CODE_PAGE_ID;
const TARGET_FILE = "docs/k8s-install.md";

const RICH_TEXT_LIMIT = 1900;

function splitText(text, size) {
  const chunks = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

async function getAllChildBlocks(blockId) {
  const blocks = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
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

async function appendBlocks(pageId, content) {
  const now = new Date().toISOString();
  const chunks = splitText(content, RICH_TEXT_LIMIT);

  const children = [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `GitHub에서 자동 동기화됨: ${TARGET_FILE}\nLast synced: ${now}`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "code",
      code: {
        language: "markdown",
        rich_text: chunks.map((chunk) => ({
          type: "text",
          text: {
            content: chunk,
          },
        })),
      },
    },
  ];

  await notion.blocks.children.append({
    block_id: pageId,
    children,
  });
}

async function main() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is missing");
  }

  if (!PAGE_ID) {
    throw new Error("NOTION_CODE_PAGE_ID is missing");
  }

  const filePath = path.join(process.cwd(), TARGET_FILE);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Target file not found: ${TARGET_FILE}`);
  }

  const content = fs.readFileSync(filePath, "utf8");

  await clearPage(PAGE_ID);
  await appendBlocks(PAGE_ID, content);

  console.log(`Synced ${TARGET_FILE} to Notion page ${PAGE_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});