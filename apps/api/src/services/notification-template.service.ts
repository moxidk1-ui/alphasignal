import type { NotificationJobData } from "@alphasignal/queue";
import type { NotificationRecipient, NotificationSignal } from "../repositories/notification.repository.js";

type NotificationEvent = NotificationJobData["event"];

export interface NotificationEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderNotificationEmail(
  event: NotificationEvent,
  signal: NotificationSignal,
  recipient: NotificationRecipient,
  frontendUrl: string,
): NotificationEmail {
  const content = messageContent(event, signal, frontendUrl);
  const levelRows = event === "SIGNAL_CLOSED"
    ? `<p style="font-size:18px;font-weight:600;margin:20px 0;color:${resultColor(signal.result)}">${escapeHtml(signal.result)}${signal.pnlPercent === null ? "" : ` (${formatSigned(signal.pnlPercent)}%)`}</p>`
    : `
      <table style="border-collapse:collapse;margin:20px 0;width:100%;font-family:'JetBrains Mono',monospace;font-size:14px">
        <tr><td style="color:#64748b;padding:6px 0">Entry</td><td style="text-align:right">${formatPrice(signal.entryPrice)}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Stop Loss</td><td style="text-align:right;color:#ef4444">${formatPrice(signal.stopLoss)}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Targets</td><td style="text-align:right;color:#22c55e">${formatPrice(signal.takeProfit1)} / ${formatPrice(signal.takeProfit2)} / ${formatPrice(signal.takeProfit3)}</td></tr>
      </table>`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#080a0f;color:#e2e8f0;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#111318;border:1px solid #252a3a;padding:28px;border-radius:6px">
        <p style="margin:0 0 10px;color:#64748b;font-size:12px;text-transform:uppercase">${escapeHtml(content.label)}</p>
        <h1 style="margin:0 0 8px;font-size:22px">${escapeHtml(signal.ticker)} ${escapeHtml(signal.direction)} - ${escapeHtml(signal.timeframe)}</h1>
        <p style="margin:0;color:#cbd5e1">Hi ${escapeHtml(recipient.name)}, ${escapeHtml(content.intro)}</p>
        ${levelRows}
        <p style="color:#cbd5e1;font-size:14px">Strategy: ${escapeHtml(signal.strategy)} | Confidence: ${signal.confidence}% | Provider: ${escapeHtml(signal.provider.name)}</p>
        <p style="margin:24px 0 0">
          <a href="${content.url}" style="background:#3b82f6;color:#fff;padding:12px 16px;text-decoration:none;border-radius:6px;display:inline-block">${escapeHtml(content.action)}</a>
        </p>
      </div>
    </div>
  `;
  const text = [
    content.label,
    `${signal.ticker} (${signal.market}) [${signal.timeframe}] ${signal.direction}`,
    content.intro,
    event === "SIGNAL_CLOSED"
      ? `Result: ${signal.result}${signal.pnlPercent === null ? "" : ` (${formatSigned(signal.pnlPercent)}%)`}`
      : `Entry: ${formatPrice(signal.entryPrice)} | SL: ${formatPrice(signal.stopLoss)} | TP1: ${formatPrice(signal.takeProfit1)} | TP2: ${formatPrice(signal.takeProfit2)} | TP3: ${formatPrice(signal.takeProfit3)}`,
    `Strategy: ${signal.strategy} | Confidence: ${signal.confidence}% | Provider: ${signal.provider.name}`,
    content.url,
  ].join("\n");

  return { subject: content.subject, html, text };
}

export function renderTelegramMessage(
  event: NotificationEvent,
  signal: NotificationSignal,
  frontendUrl: string,
): string {
  if (event === "ALGO_PENDING_APPROVAL") {
    return [
      `⚡ Algo Detection - ${signal.ticker} ${signal.direction}`,
      `Pattern: ${signal.strategy} | Confidence: ${signal.confidence}%`,
      `Entry: ${formatPrice(signal.entryPrice)} | SL: ${formatPrice(signal.stopLoss)} | TP: ${formatPrice(signal.takeProfit1)}`,
      `👉 Review & Approve: ${frontendUrl}/algo/review/${signal.algoDetectionId ?? signal.id}`,
    ].join("\n");
  }

  if (event === "SIGNAL_CLOSED") {
    return [
      `🔔 Signal Closed - ${signal.ticker} (${signal.market}) [${signal.timeframe}]`,
      `${signal.direction === "LONG" ? "LONG 📈" : "SHORT 📉"}`,
      "---------------------",
      `Result: ${signal.result}${signal.pnlPercent === null ? "" : ` | PnL: ${formatSigned(signal.pnlPercent)}%`}`,
      `Provider: ${signal.provider.name}`,
      "---------------------",
      `👉 ${frontendUrl}/signals/${signal.id}`,
    ].join("\n");
  }

  return [
    `🔔 New Signal - ${signal.ticker} (${signal.market}) [${signal.timeframe}]`,
    `${signal.direction === "LONG" ? "LONG 📈" : "SHORT 📉"}`,
    "---------------------",
    `Entry:  ${formatPrice(signal.entryPrice)}`,
    `SL:     ${formatPrice(signal.stopLoss)}`,
    `TP1:    ${formatPrice(signal.takeProfit1)}  |  TP2: ${formatPrice(signal.takeProfit2)}  |  TP3: ${formatPrice(signal.takeProfit3)}`,
    `R:R:    ${signal.riskRewardRatio.toFixed(2)}`,
    "---------------------",
    `Strategy:   ${signal.strategy}`,
    `Confidence: ${signal.confidence}% ${confidenceMarker(signal.confidence)}`,
    `Source:     ${signal.source === "AI_HYBRID" ? "AI" : signal.source}`,
    `Provider:   ${signal.provider.name}`,
    "---------------------",
    `👉 ${frontendUrl}/signals/${signal.id}`,
  ].join("\n");
}

function messageContent(event: NotificationEvent, signal: NotificationSignal, frontendUrl: string) {
  if (event === "ALGO_PENDING_APPROVAL") {
    return {
      label: "Algo detection pending approval",
      intro: "the algorithm found a setup requiring your approval.",
      subject: `${signal.ticker} ${signal.direction} algo detection pending approval`,
      action: "Review detection",
      url: `${frontendUrl}/algo/review/${signal.algoDetectionId ?? signal.id}`,
    };
  }
  if (event === "SIGNAL_CLOSED") {
    return {
      label: "Signal outcome",
      intro: "a subscribed signal has been closed.",
      subject: `${signal.ticker} signal closed - ${signal.result}`,
      action: "View result",
      url: `${frontendUrl}/signals/${signal.id}`,
    };
  }

  return {
    label: "New signal",
    intro: "a provider you follow has published a signal.",
    subject: `New ${signal.direction} signal - ${signal.ticker}`,
    action: "View signal",
    url: `${frontendUrl}/signals/${signal.id}`,
  };
}

function confidenceMarker(confidence: number): string {
  return confidence >= 80 ? "🟢" : confidence >= 50 ? "🟡" : "🔴";
}

function resultColor(result: NotificationSignal["result"]): string {
  return result === "WIN" ? "#22c55e" : result === "LOSS" ? "#ef4444" : "#f59e0b";
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : value.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
