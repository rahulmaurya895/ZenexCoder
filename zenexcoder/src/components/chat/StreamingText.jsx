/**
 * @param {{text: string, active?: boolean}} props
 */
export default function StreamingText({ text, active = false }) {
  return (
    <span>
      {text}
      {active && <span className="streaming-cursor" />}
    </span>
  );
}
