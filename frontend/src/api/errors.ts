export async function apiError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const payload: unknown = await response.json().catch(() => null);
  const detail =
    payload && typeof payload === "object" && "detail" in payload
      ? payload.detail
      : null;
  if (typeof detail === "string") return new Error(detail);
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item: unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("msg" in item) ||
        typeof item.msg !== "string"
      )
        return [];
      const location =
        "loc" in item && Array.isArray(item.loc)
          ? item.loc
              .filter((part) => part !== "body")
              .join(" / ")
              .replaceAll("_", " ")
          : "Input";
      return [`${location}: ${item.msg}`];
    });
    if (messages.length) return new Error(messages.join("; "));
  }
  return new Error(fallback);
}
