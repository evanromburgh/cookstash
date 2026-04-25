import { escapeHtml } from "@/lib/security/escape-html";

type SafeTextProps = {
  value: string;
};

export function SafeText({ value }: SafeTextProps) {
  return <span>{escapeHtml(value)}</span>;
}
