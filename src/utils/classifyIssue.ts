export function classifyIssue(text = ""): "billing" | "technical" | "nothing" {
  const message = text.toLowerCase();

  const billingKeywords = [
    "payment", "refund", "invoice", "billing", "charge","pay",
    "subscription", "card", "checkout", "deducted"
  ];

  const techKeywords = [
    "error", "crash", "bug", "freeze", "not working",
    "failed", "login", "loading", "500", "404", "issue", "screen"
  ];

  if (billingKeywords.some(k => message.includes(k))) {
    return "billing";
  }

  if (techKeywords.some(k => message.includes(k))) {
    return "technical";
  }

  return "nothing";
}
