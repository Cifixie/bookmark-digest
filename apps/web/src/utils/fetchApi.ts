import { fetchAuthSession } from "aws-amplify/auth";

const apiUrl = import.meta.env.VITE_PUBLIC_API_URL ?? "";

async function getAuthToken() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error(
      "Failed to retrieve ID token from the authentication session.",
    );
  }
  return token;
}

export async function fetchWithAuth(
  method: string,
  uri: string,
  body?: any,
): Promise<Response> {
  const base = apiUrl.replace(/\/+$/, "");
  const path = uri.replace(/^\/+/, "");
  return fetch(`${base}/${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      Authorization: await getAuthToken(),
    },
  });
}
