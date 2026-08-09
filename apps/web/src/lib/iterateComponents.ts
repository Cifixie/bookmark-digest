import type { BaseComponentProps } from "@json-render/react";
import type { FC, ReactNode } from "react";

type Fn = <T extends object>(
  component: FC<T>,
) => (props: BaseComponentProps<T>) => ReactNode;

export function iterateComponents<K>(components: K, fn: Fn) {
  const mapFn = ([n, c]: [string, FC<object>]) => [n, fn(c)];
  return Object.fromEntries(
    Object.entries(components as Record<string, FC<object>>).map(mapFn),
  );
}
