import type { DocumentSection } from '../interfaces/textract.interface';

/**
 * One block of a page in reading order, whoever read it: Textract LAYOUT for an OCRed page, the
 * PDF's own text layer otherwise. A title or heading starts a section; text is one paragraph.
 */
export interface LayoutItem {
  kind: 'title' | 'heading' | 'text';
  text: string;
  page: number;
}

/**
 * The document's sections (`content_structured`) and its flat text (`content`): each title or
 * heading starts a section, paragraphs join its content one per line.
 */
export function sectionsFromLayout(items: LayoutItem[]): {
  text: string;
  sections: DocumentSection[];
} {
  const sections: DocumentSection[] = [];
  let current: {
    heading: string | null;
    level: number;
    lines: string[];
    pageStart: number;
  } = { heading: null, level: 1, lines: [], pageStart: items[0]?.page ?? 1 };

  const close = (): void => {
    if (current.lines.length > 0 || current.heading !== null) {
      sections.push({
        heading: current.heading,
        level: current.level,
        content: current.lines.join('\n'),
        pageStart: current.pageStart,
      });
    }
  };

  for (const item of items) {
    if (!item.text) continue;
    if (item.kind === 'text') {
      current.lines.push(item.text);
      continue;
    }
    close();
    current = {
      heading: item.text,
      level: item.kind === 'title' ? 0 : 1,
      lines: [],
      pageStart: item.page,
    };
  }
  close();

  const text = sections
    .map((s) => (s.heading ? `${s.heading}\n${s.content}` : s.content))
    .filter(Boolean)
    .join('\n\n');
  return { text, sections };
}
