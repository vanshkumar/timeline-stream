import { setIcon, type IconName } from "obsidian";
import { useLayoutEffect, useRef } from "react";

export interface StreamIconProps {
  name: IconName;
}

export function StreamIcon({ name }: StreamIconProps) {
  const iconRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = iconRef.current;
    if (!element) return;
    setIcon(element, name);
    return () => element.replaceChildren();
  }, [name]);

  return <span ref={iconRef} className="personal-stream-icon" aria-hidden="true" />;
}
