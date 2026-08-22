import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/server/auth";

export const runtime = "nodejs";

export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(getAuth()).POST(request);
export const PATCH = (request: Request) => toNextJsHandler(getAuth()).PATCH(request);
export const PUT = (request: Request) => toNextJsHandler(getAuth()).PUT(request);
export const DELETE = (request: Request) => toNextJsHandler(getAuth()).DELETE(request);
