"""LangGraph workflow for researching, drafting, and reviewing LinkedIn posts."""
import os
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_tavily import TavilySearch
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

load_dotenv()

MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "3"))
search_tool = TavilySearch(max_results=3)
tools = [search_tool]
writer_llm = ChatGoogleGenerativeAI(model=os.getenv("WRITER_MODEL", "gemini-3.5-flash-lite"), temperature=0.7)
writer_with_tools = writer_llm.bind_tools(tools)
reviewer_llm = ChatGroq(model=os.getenv("REVIEWER_MODEL", "openai/gpt-oss-20b"), temperature=0)


class State(TypedDict):
    topic: str
    messages: Annotated[list[BaseMessage], add_messages]
    draft: str
    review_feedback: str
    is_approved: bool
    attempt: int


WRITER_PROMPT = """You are an expert LinkedIn content writer. Use the web search tool whenever current information, statistics, or trends would improve accuracy. Search at most once per draft; after seeing search results, write the post. If reviewer feedback is present, address every point. Write 150–200 words with a strong first-line hook, one useful takeaway, short paragraphs, and an engaging closing question or CTA. Use no hashtags. Return only the post text."""
REVIEWER_PROMPT = """You are a strict but fair LinkedIn editor. Check: strong first-line hook; one valuable takeaway; skimmable short paragraphs; roughly 150–200 words; engaging closing question or CTA; professional human tone; no hashtags. Respond exactly:
VERDICT: APPROVED or REJECTED
FEEDBACK: one short paragraph explaining the decision. Approve only if publish-ready."""


def writer_node(state: State) -> dict:
    # Tool calls are part of the current draft attempt, not a new attempt.
    last = state.get("messages", [])[-1] if state.get("messages") else None
    attempt = state.get("attempt", 0) + (0 if getattr(last, "type", "") == "tool" else 1)
    feedback = state.get("review_feedback", "")
    user_text = f"Write a LinkedIn post about: {state['topic']}\n"
    if feedback:
        user_text += f"\nPrevious draft feedback (fix every point):\n{feedback}\nWrite a fresh improved draft."
    prompt_messages = [("system", WRITER_PROMPT), ("human", user_text)]
    if getattr(last, "type", "") == "tool":
        # ToolNode's result is useful only when the matching tool-call message
        # accompanies it in the next model request.
        prompt_messages.extend(state["messages"][-2:])
    response = writer_with_tools.invoke(prompt_messages)
    return {"messages": [response], "attempt": attempt}


def route_writer(state: State) -> str:
    last = state["messages"][-1]
    return "tools" if getattr(last, "tool_calls", None) else "extract_draft"


def extract_draft(state: State) -> dict:
    message = state["messages"][-1]
    content = message.content
    if isinstance(content, list):
        content = "\n".join(
            block.get("text", "") if isinstance(block, dict) and block.get("type") == "text" else str(block)
            for block in content
        )
    return {"draft": str(content).strip()}


def reviewer_node(state: State) -> dict:
    response = reviewer_llm.invoke([
        ("system", REVIEWER_PROMPT),
        ("human", f"Review this LinkedIn post draft:\n\n{state['draft']}"),
    ])
    text = str(response.content).strip()
    verdict_line = text.upper().split("FEEDBACK:", 1)[0]
    approved = "VERDICT: APPROVED" in verdict_line
    feedback = text.split("FEEDBACK:", 1)[-1].strip() if "FEEDBACK:" in text else text
    return {"review_feedback": feedback, "is_approved": approved}


def route_review(state: State) -> str:
    return END if state["is_approved"] or state["attempt"] >= MAX_ATTEMPTS else "writer"


builder = StateGraph(State)
builder.add_node("writer", writer_node)
builder.add_node("tools", ToolNode(tools))
builder.add_node("extract_draft", extract_draft)
builder.add_node("reviewer", reviewer_node)
builder.add_edge(START, "writer")
builder.add_conditional_edges("writer", route_writer, {"tools": "tools", "extract_draft": "extract_draft"})
# Tool results return to the tool-aware writer; review starts only after a draft is ready.
builder.add_edge("tools", "writer")
builder.add_edge("extract_draft", "reviewer")
builder.add_conditional_edges("reviewer", route_review, {END: END, "writer": "writer"})
app = builder.compile()


def run_workflow(topic: str, config: dict | None = None) -> dict:
    return app.invoke({"topic": topic, "messages": [], "draft": "", "review_feedback": "", "is_approved": False, "attempt": 0}, config=config or {"recursion_limit": 30})
