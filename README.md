# draftFlow · Iterative LinkedIn Post Studio

A React frontend for a LangGraph agent that researches, drafts, reviews, and refines LinkedIn posts. The browser receives server-sent events from the Python API and displays each writer, Tavily, and reviewer step as it happens.

## Run locally

1. Create a Python virtual environment, activate it, and install `requirements.txt`.
2. Copy `.env.example` to `.env` and add Google AI Studio, Groq, and Tavily API keys.
3. Start the API: `uvicorn api:app --reload --port 8001`.
4. In another terminal run `npm install` and `npm run dev`.
5. Open the Vite URL (usually `http://localhost:5173`). Vite proxies `/api` to `http://localhost:8001` during development.

## Deploy

### Render API

Create a Render Blueprint from this repository using `render.yaml`. Set `GOOGLE_API_KEY`, `GROQ_API_KEY`, and `TAVILY_API_KEY` in the service environment. Set `FRONTEND_ORIGIN` to the exact deployed Vercel origin (for example `https://draftflow.vercel.app`). The API health check is `/health`.

### Vercel frontend

Import this repository as a Vite project. Set `VITE_API_URL` to the Render service origin, without a trailing slash (for example `https://draftflow-api.onrender.com`), then deploy. The Vercel rewrite supports the single-page app route. Redeploy after changing build-time environment variables.

## Workflow

`START → writer → (Tavily ToolNode → writer)* → extract_draft → reviewer → (writer … | END)`

The writer and reviewer use different models and temperatures. Search is requested by the writer at runtime, the reviewer sends quality feedback back around the graph, `MAX_ATTEMPTS` caps drafts (default 3), and LangGraph receives a `recursion_limit` of 30. Keep provider API keys in the backend environment; never put them in a `VITE_` variable.
