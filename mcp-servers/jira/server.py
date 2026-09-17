#!/usr/bin/env python3
"""Jira MCP server for Claude Code — read-only ticket context."""

import os
import sys
from base64 import b64encode

import httpx
from mcp.server.fastmcp import FastMCP

JIRA_URL = os.environ.get("JIRA_URL", "").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN", "")

mcp = FastMCP("jira")


def _check_config():
    missing = []
    if not JIRA_URL:
        missing.append("JIRA_URL")
    if not JIRA_EMAIL:
        missing.append("JIRA_EMAIL")
    if not JIRA_API_TOKEN:
        missing.append("JIRA_API_TOKEN")
    if missing:
        return f"Missing env vars: {', '.join(missing)}. Re-run j2 install.sh to configure."
    return None


def _auth_header():
    token = b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Accept": "application/json"}


def _format_ticket(data: dict) -> str:
    fields = data.get("fields", {})
    key = data.get("key", "?")
    summary = fields.get("summary", "No summary")
    status = fields.get("status", {}).get("name", "Unknown")
    priority = fields.get("priority", {}).get("name", "Unknown")
    assignee = fields.get("assignee", {})
    assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
    issue_type = fields.get("issuetype", {}).get("name", "Unknown")
    description = fields.get("description") or "No description"
    labels = fields.get("labels", [])
    acceptance = fields.get("customfield_10024") or ""

    lines = [
        f"# {key}: {summary}",
        f"**Type:** {issue_type} | **Status:** {status} | **Priority:** {priority}",
        f"**Assignee:** {assignee_name}",
    ]
    if labels:
        lines.append(f"**Labels:** {', '.join(labels)}")
    lines.append(f"\n## Description\n{description}")
    if acceptance:
        lines.append(f"\n## Acceptance Criteria\n{acceptance}")
    return "\n".join(lines)


def _format_comments(comments: list) -> str:
    if not comments:
        return "\n## Comments\nNo comments."
    lines = ["\n## Comments"]
    for c in comments:
        author = c.get("author", {}).get("displayName", "Unknown")
        created = c.get("created", "")[:10]
        body = c.get("body", "")
        lines.append(f"\n**{author}** ({created}):\n{body}")
    return "\n".join(lines)


@mcp.tool()
def get_ticket(ticket_key: str) -> str:
    """Fetch a Jira ticket with description, acceptance criteria, and comments.

    Args:
        ticket_key: Jira issue key (e.g. PROJ-123)
    """
    err = _check_config()
    if err:
        return err

    url = f"{JIRA_URL}/rest/api/2/issue/{ticket_key}"
    try:
        resp = httpx.get(url, headers=_auth_header(), timeout=15)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        return f"Jira API error: {e.response.status_code} — {e.response.text[:200]}"
    except httpx.RequestError as e:
        return f"Connection error: {e}"

    data = resp.json()
    ticket_text = _format_ticket(data)

    comments_url = f"{url}/comment"
    try:
        cresp = httpx.get(comments_url, headers=_auth_header(), timeout=15)
        cresp.raise_for_status()
        comments = cresp.json().get("comments", [])
    except Exception:
        comments = []

    return ticket_text + _format_comments(comments)


@mcp.tool()
def search_tickets(jql: str, max_results: int = 10) -> str:
    """Search Jira tickets using JQL.

    Args:
        jql: JQL query string (e.g. 'project = PROJ AND status = "In Progress"')
        max_results: Maximum number of results (default 10, max 50)
    """
    err = _check_config()
    if err:
        return err

    max_results = min(max_results, 50)
    url = f"{JIRA_URL}/rest/api/2/search"
    params = {"jql": jql, "maxResults": max_results, "fields": "summary,status,priority,assignee,issuetype"}

    try:
        resp = httpx.get(url, headers=_auth_header(), params=params, timeout=15)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        return f"Jira API error: {e.response.status_code} — {e.response.text[:200]}"
    except httpx.RequestError as e:
        return f"Connection error: {e}"

    data = resp.json()
    issues = data.get("issues", [])
    total = data.get("total", 0)

    if not issues:
        return f"No results for: {jql}"

    lines = [f"**{total} total results** (showing {len(issues)})\n"]
    for issue in issues:
        key = issue["key"]
        f = issue["fields"]
        summary = f.get("summary", "")
        status = f.get("status", {}).get("name", "?")
        priority = f.get("priority", {}).get("name", "?")
        assignee = f.get("assignee", {})
        name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
        lines.append(f"- **{key}**: {summary} [{status}] P:{priority} @{name}")

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
