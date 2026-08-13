export const DigestFooter = ({ content }: { content?: string }) => (
  content ? (
    <footer style={{
      borderTop: "1px solid var(--border-light)",
      padding: "16px 0",
      marginTop: 32,
      fontSize: 13,
      color: "var(--text-muted)",
    }}>
      {content}
    </footer>
  ) : null
);
