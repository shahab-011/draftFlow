"""SSE API for the React client. Run with: uvicorn api:app --host 0.0.0.0 --port 8000"""
import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from iterative_tool import MAX_ATTEMPTS, app as workflow

app = FastAPI(title="Iterative LinkedIn Post Generator", version="1.0.0")
origins = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])


class GenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)


def emit(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.get("/health")
def health():
    return {"status": "ok", "max_attempts": MAX_ATTEMPTS}


@app.post("/api/generate")
def generate(body: GenerateRequest):
    topic = body.topic.strip()
    if len(topic) < 3:
        raise HTTPException(422, "Please enter a topic with at least 3 characters.")

    def events():
        state = {"topic": topic, "messages": [], "draft": "", "review_feedback": "", "is_approved": False, "attempt": 0}
        yield emit("start", {"topic": topic, "max_attempts": MAX_ATTEMPTS})
        try:
            for update in workflow.stream(state, config={"recursion_limit": 30}, stream_mode="updates"):
                for node, values in update.items():
                    if node == "writer":
                        state["attempt"] = values.get("attempt", state["attempt"])
                        msg = values.get("messages", [])
                        if msg:
                            last = msg[-1]
                            calls = getattr(last, "tool_calls", []) or []
                            if calls:
                                yield emit("search", {"attempt": state["attempt"], "query": topic, "status": "searching"})
                            else:
                                yield emit("writing", {"attempt": state["attempt"], "status": "drafting"})
                    elif node == "tools":
                        yield emit("search", {"attempt": state["attempt"], "query": topic, "status": "complete"})
                    elif node == "extract_draft":
                        state["draft"] = values.get("draft", "")
                        yield emit("draft", {"attempt": state["attempt"], "text": state["draft"]})
                    elif node == "reviewer":
                        state.update(values)
                        yield emit("review", {"attempt": state["attempt"], "approved": state["is_approved"], "feedback": state["review_feedback"]})
            yield emit("complete", {"topic": topic, "draft": state["draft"], "attempts": state["attempt"], "approved": state["is_approved"], "feedback": state["review_feedback"], "max_attempts": MAX_ATTEMPTS})
        except Exception as exc:
            yield emit("error", {"message": str(exc)})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
