// HTTP injection into Express without opening a socket; exercises real middleware/routes/SQL.
import inject from "light-my-request";
import type { RequestListener } from "node:http";
function createAgent(app: RequestListener, keepCookies = false) {
  const jar: Record<string, string> = {};
  const make = (method: string, url: string) => {
    const headers: Record<string, string> = {};
    let payload: unknown;
    const chain = {
      set(name: string, value: string) {
        headers[name] = value;
        return chain;
      },
      send(body: unknown) {
        payload = body;
        headers["Content-Type"] = "application/json";
        return chain;
      },
      then(
        resolve: (value: any) => unknown,
        reject?: (error: unknown) => unknown,
      ) {
        return inject(app, {
          method,
          url,
          headers,
          remoteAddress: "::ffff:127.0.0.1",
          cookies: jar,
          ...(payload === undefined
            ? {}
            : { payload: JSON.stringify(payload) }),
        }).then((response) => {
          if (keepCookies)
            for (const cookie of response.cookies)
              jar[cookie.name] = cookie.value;
          let body: any = null;
          try {
            body = response.json();
          } catch {}
          return resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
          });
        }, reject);
      },
    };
    return chain;
  };
  return Object.fromEntries(
    ["get", "post", "put", "patch", "delete"].map((method) => [
      method,
      (url: string) => make(method.toUpperCase(), url),
    ]),
  ) as any;
}
export const request = Object.assign(
  (app: RequestListener) => createAgent(app),
  { agent: (app: RequestListener) => createAgent(app, true) },
);
