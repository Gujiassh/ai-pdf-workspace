export type ChatScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export const CHAT_SCROLL_BOTTOM_THRESHOLD = 48;

export function isNearChatBottom(
  metrics: ChatScrollMetrics,
  threshold = CHAT_SCROLL_BOTTOM_THRESHOLD,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}
