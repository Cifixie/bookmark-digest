export const DigestFooter = ({ content }: { content?: string }) => (
  content ? (
    <footer style={{
      borderTop: "1px solid #e0e0e0",
      padding: "16px 0",
      marginTop: 32,
      fontSize: 13,
      color: "#888",
    }}>
      {content}
    </footer>
  ) : null
);
