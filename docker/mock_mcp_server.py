#!/usr/bin/env python3
"""
Mock MCP Server for Docker.

This server intentionally exposes a simple HTTP MCP endpoint at `/mcp`
so it is reachable both from the local network and from the Java gateway,
which uses streamable HTTP transport semantics.
"""
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route


TOOLS = [
    {
        "name": "get_logs",
        "description": "Get mock application logs",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query for logs"
                }
            }
        }
    },
    {
        "name": "search_data",
        "description": "Search mock data",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                }
            },
            "required": ["query"]
        }
    }
]

RESOURCES = [
    {
        "uri": "mock://resource1",
        "name": "Mock Resource 1",
        "description": "A mock resource for testing",
        "mimeType": "text/plain"
    },
    {
        "uri": "mock://resource2",
        "name": "Mock Resource 2",
        "description": "Another mock resource",
        "mimeType": "application/json"
    }
]

PROMPTS = [
    {
        "name": "greeting",
        "description": "A simple greeting prompt",
        "arguments": []
    },
    {
        "name": "summarize",
        "description": "Summarize text",
        "arguments": [
            {"name": "text", "description": "Text to summarize", "required": True}
        ]
    }
]


def success_response(request_id, result):
    return JSONResponse({
        "jsonrpc": "2.0",
        "id": request_id,
        "result": result
    })


def error_response(request_id, code, message, status_code=200):
    return JSONResponse({
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {
            "code": code,
            "message": message
        }
    }, status_code=status_code)


async def handle_root(_request: Request):
    return JSONResponse({
        "name": "mock-mcp-server",
        "status": "ok",
        "mcp_endpoint": "/mcp",
        "health_endpoint": "/health"
    })


async def handle_health(_request: Request):
    return JSONResponse({"status": "healthy"})


async def handle_mcp_discovery(_request: Request):
    return JSONResponse({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {},
            "resources": {},
            "prompts": {}
        },
        "serverInfo": {
            "name": "mock-mcp-server-docker",
            "version": "1.0.0"
        }
    })


async def handle_mcp_request(request: Request):
    body = await request.json()
    method = body.get("method")
    request_id = body.get("id")
    params = body.get("params") or {}

    if method == "initialize":
        return success_response(request_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {},
                "resources": {},
                "prompts": {}
            },
            "serverInfo": {
                "name": "mock-mcp-server-docker",
                "version": "1.0.0"
            }
        })

    if method == "tools/list":
        return success_response(request_id, {"tools": TOOLS})

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}

        if name == "get_logs":
            text = f"Mock logs for query: {arguments.get('query', '')}"
        elif name == "search_data":
            text = f"Mock search results for: {arguments.get('query', '')}"
        else:
            text = f"Unknown tool: {name}"

        return success_response(request_id, {
            "content": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        })

    if method == "resources/list":
        return success_response(request_id, {"resources": RESOURCES})

    if method == "resources/read":
        uri = params.get("uri")
        if uri == "mock://resource1":
            text = "This is the content of mock resource 1"
        elif uri == "mock://resource2":
            text = '{"data": "Mock resource 2 content", "type": "json"}'
        else:
            text = f"Unknown resource: {uri}"

        return success_response(request_id, {
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "text/plain",
                    "text": text
                }
            ]
        })

    if method == "prompts/list":
        return success_response(request_id, {"prompts": PROMPTS})

    if method == "prompts/get":
        name = params.get("name")
        arguments = params.get("arguments") or {}

        if name == "greeting":
            text = "Hello! How can I help you today?"
        elif name == "summarize":
            text = f"Please summarize the following text:\n\n{arguments.get('text', '')}"
        else:
            text = f"Unknown prompt: {name}"

        return success_response(request_id, {
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": text
                    }
                }
            ]
        })

    if isinstance(method, str) and method.startswith("notifications/"):
        return JSONResponse({})

    return error_response(request_id, -32601, f"Method not found: {method}")


app = Starlette(
    routes=[
        Route("/", handle_root, methods=["GET"]),
        Route("/health", handle_health, methods=["GET"]),
        Route("/mcp", handle_mcp_discovery, methods=["GET"]),
        Route("/mcp", handle_mcp_request, methods=["POST"]),
    ]
)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
