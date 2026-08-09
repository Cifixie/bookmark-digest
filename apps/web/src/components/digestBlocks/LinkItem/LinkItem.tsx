import type { LinkItemProps } from "@bookmark-digest/catalog";

export const LinkItem = (props: LinkItemProps) => {
  const { text, href, description } = props;
  return (
    <li style={{ marginBottom: 8 }}>
      <a href={href} style={{ color: "#1a73e8", textDecoration: "underline" }}>{text}</a>
      {description && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>{description}</p>}
    </li>
  );
};
