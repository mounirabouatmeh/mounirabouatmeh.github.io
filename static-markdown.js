(() => {
  function appendInline(container, text) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > lastIndex) container.append(document.createTextNode(text.slice(lastIndex, match.index)));
      const token = match[0];
      if (token.startsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        container.append(strong);
      } else {
        const code = document.createElement("code");
        code.textContent = token.slice(1, -1);
        container.append(code);
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) container.append(document.createTextNode(text.slice(lastIndex)));
  }

  function tableCells(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function renderTable(lines, start) {
    const headers = tableCells(lines[start]);
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of headers) {
      const th = document.createElement("th");
      appendInline(th, cell);
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    let index = start + 2;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim() || !line.includes("|")) break;
      const cells = tableCells(line);
      if (cells.length !== headers.length) break;
      const row = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        appendInline(td, cell);
        row.append(td);
      }
      tbody.append(row);
      index += 1;
    }
    table.append(tbody);
    wrapper.append(table);
    return { node: wrapper, nextIndex: index };
  }

  function renderMarkdown(container, markdown) {
    const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
    let index = 0;
    let list = null;
    let listType = null;

    const closeList = () => {
      list = null;
      listType = null;
    };

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        closeList();
        index += 1;
        continue;
      }

      if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
        closeList();
        const rendered = renderTable(lines, index);
        container.append(rendered.node);
        index = rendered.nextIndex;
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(4, heading[1].length + 1);
        const node = document.createElement(`h${level}`);
        appendInline(node, heading[2]);
        container.append(node);
        index += 1;
        continue;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        const wantedType = numbered ? "ol" : "ul";
        if (!list || listType !== wantedType) {
          list = document.createElement(wantedType);
          listType = wantedType;
          container.append(list);
        }
        const li = document.createElement("li");
        appendInline(li, (bullet ?? numbered)[1]);
        list.append(li);
        index += 1;
        continue;
      }

      closeList();
      const paragraph = document.createElement("p");
      appendInline(paragraph, trimmed);
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) break;
        if (index + 1 < lines.length && next.includes("|") && isTableDivider(lines[index + 1])) break;
        if (/^(#{1,4})\s+/.test(nextTrimmed) || /^[-*]\s+/.test(nextTrimmed) || /^\d+[.)]\s+/.test(nextTrimmed)) break;
        paragraph.append(document.createElement("br"));
        appendInline(paragraph, nextTrimmed);
        index += 1;
      }
      container.append(paragraph);
    }
  }

  function enhance(root = document) {
    for (const bubble of root.querySelectorAll?.(".assistant-bubble:not([data-markdown-rendered])") ?? []) {
      const markdown = bubble.textContent ?? "";
      bubble.replaceChildren();
      bubble.classList.add("markdown-body");
      bubble.dataset.markdownRendered = "true";
      renderMarkdown(bubble, markdown);
    }
  }

  if (typeof document !== "undefined") {
    const start = () => {
      enhance();
      const target = document.getElementById("conversation") ?? document.body;
      const observer = new MutationObserver(() => queueMicrotask(() => enhance(target)));
      observer.observe(target, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})();
