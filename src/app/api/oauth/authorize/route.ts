/** Only machine-to-machine access (client_credentials) exists: no user-facing authorization flow. */
function unsupported() {
  return Response.json(
    { error: "unsupported_response_type", error_description: "Only the client_credentials grant is supported." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = unsupported;
export const POST = unsupported;
