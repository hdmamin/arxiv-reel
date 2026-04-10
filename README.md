# TLDRxiv

TikTok-style card UI for browsing ML research papers from arXiv. Papers are fetched from arXiv, filtered by an LLM for relevance, and displayed as swipeable cards with question/thesis/method extraction.

## Setup

```bash
npm install
npx prisma db push
```

Create a `.env` file:
```
OPENAI_API_KEY=sk-...
DATABASE_URL="file:./db/interactions.db"
```

Then run:
```bash
npm run dev
```

Open http://localhost:3000.

