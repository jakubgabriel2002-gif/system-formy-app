
interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Endpoint not implemented yet" },
        { status: 404 }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
