"""Tiny renderer for the flowchart subset of Mermaid used in the documentation.

Supports: `flowchart TD|TB|LR`, nodes `A[text]`, `A(text)`, `A{text}`, `A[(text)]`, `A([text])`,
edges `-->`, `-.->`, `==>`, `---` with optional `|label|`, chained edges, `<br/>` line breaks.
Subgraph, style and class lines are ignored. Renders a PNG with Pillow.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFont

FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

ARROW = re.compile(r"(-\.->|==>|-->|---)(\|[^|]*\|)?")
NODE = re.compile(r"^\s*([A-Za-z0-9_]+)\s*(\[\(.*\)\]|\(\[.*\]\)|\[.*\]|\(.*\)|\{.*\})?\s*$", re.S)


@dataclass
class Node:
    id: str
    label: str
    shape: str = "box"  # box | db | decision
    layer: int = 0
    order: float = 0.0
    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0
    lines: list = field(default_factory=list)


@dataclass
class Edge:
    a: str
    b: str
    label: str = ""
    dotted: bool = False


def _clean(label: str) -> str:
    label = label.strip().strip('"')
    return re.sub(r"<br\s*/?>", "\n", label)


def parse(src: str):
    lines = [l.rstrip() for l in src.strip().splitlines() if l.strip()]
    head = lines[0].split()
    direction = "LR" if len(head) > 1 and head[1].upper() == "LR" else "TD"
    nodes: dict[str, Node] = {}
    edges: list[Edge] = []

    def get(token: str) -> str:
        m = NODE.match(token)
        if not m:
            raise ValueError(f"cannot parse node: {token!r}")
        nid, shape = m.group(1), m.group(2)
        if nid not in nodes:
            nodes[nid] = Node(nid, nid)
        if shape:
            if shape.startswith("[("):
                nodes[nid].shape, text = "db", shape[2:-2]
            elif shape.startswith("(["):
                nodes[nid].shape, text = "box", shape[2:-2]
            elif shape.startswith("["):
                nodes[nid].shape, text = "box", shape[1:-1]
            elif shape.startswith("("):
                nodes[nid].shape, text = "box", shape[1:-1]
            else:
                nodes[nid].shape, text = "decision", shape[1:-1]
            nodes[nid].label = _clean(text)
        return nid

    for line in lines[1:]:
        s = line.strip()
        if re.match(r"^(subgraph|end|style|classDef|class|linkStyle)\b", s):
            continue
        parts = []
        pos = 0
        arrows = []
        for m in ARROW.finditer(s):
            parts.append(s[pos:m.start()])
            arrows.append((m.group(1), (m.group(2) or "").strip("|").strip()))
            pos = m.end()
        parts.append(s[pos:])
        ids = [get(p) for p in parts]
        for i, (kind, lab) in enumerate(arrows):
            edges.append(Edge(ids[i], ids[i + 1], lab, dotted=(kind in ("-.->", "---"))))
    return direction, nodes, edges


def _layers(nodes, edges):
    out = {n: [] for n in nodes}
    for e in edges:
        out[e.a].append(e.b)
    layer = {n: 0 for n in nodes}
    state: dict[str, int] = {}

    def visit(n):
        state[n] = 1
        for m in out[n]:
            if state.get(m) == 1:
                continue  # back edge, ignore
            layer[m] = max(layer[m], layer[n] + 1)
            if state.get(m) != 2:
                visit(m)
        state[n] = 2

    indeg = {n: 0 for n in nodes}
    for e in edges:
        indeg[e.b] += 1
    roots = [n for n in nodes if indeg[n] == 0] or list(nodes)
    for r in roots:
        if state.get(r) is None:
            visit(r)
    # longest-path relaxation (graph may need a few passes after back-edge skipping)
    for _ in range(len(nodes)):
        changed = False
        for e in edges:
            if layer[e.b] < layer[e.a] + 1 and state.get(e.a) == 2:
                # only if not a back edge
                if e.b not in _ancestors(out, e.a):
                    layer[e.b] = layer[e.a] + 1
                    changed = True
        if not changed:
            break
    return layer


def _ancestors(out, n):
    seen, stack = set(), [n]
    # nodes that can reach n are ancestors; simple reverse search
    rev: dict[str, list] = {}
    for a, bs in out.items():
        for b in bs:
            rev.setdefault(b, []).append(a)
    while stack:
        x = stack.pop()
        for p in rev.get(x, []):
            if p not in seen:
                seen.add(p)
                stack.append(p)
    return seen


def render(src: str, path: str, scale: int = 2):
    direction, nodes, edges = parse(src)
    layer = _layers(nodes, edges)
    for n, node in nodes.items():
        node.layer = layer[n]

    S = scale
    f_reg = ImageFont.truetype(FONT_REG, 15 * S)
    f_small = ImageFont.truetype(FONT_REG, 12 * S)
    pad_x, pad_y, line_h = 18 * S, 11 * S, 20 * S

    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    for node in nodes.values():
        node.lines = node.label.split("\n")
        tw = max(probe.textlength(t, font=f_reg) for t in node.lines)
        node.w = tw + 2 * pad_x
        node.h = len(node.lines) * line_h + 2 * pad_y
        if node.shape == "decision":
            node.w *= 1.35
            node.h *= 1.45

    by_layer: dict[int, list[Node]] = {}
    for node in nodes.values():
        by_layer.setdefault(node.layer, []).append(node)
    for i, lst in by_layer.items():
        for k, nd in enumerate(lst):
            nd.order = k
    # barycenter sweeps
    nbr_up: dict[str, list] = {n: [] for n in nodes}
    nbr_dn: dict[str, list] = {n: [] for n in nodes}
    for e in edges:
        nbr_dn[e.a].append(e.b)
        nbr_up[e.b].append(e.a)
    for _ in range(4):
        for i in sorted(by_layer):
            for nd in by_layer[i]:
                ups = [nodes[u].order for u in nbr_up[nd.id] if nodes[u].layer < i]
                if ups:
                    nd.order = sum(ups) / len(ups)
            by_layer[i].sort(key=lambda n: n.order)
            for k, nd in enumerate(by_layer[i]):
                nd.order = k
        for i in sorted(by_layer, reverse=True):
            for nd in by_layer[i]:
                dns = [nodes[u].order for u in nbr_dn[nd.id] if nodes[u].layer > i]
                if dns:
                    nd.order = (nd.order + sum(dns) / len(dns)) / 2
            by_layer[i].sort(key=lambda n: n.order)
            for k, nd in enumerate(by_layer[i]):
                nd.order = k

    gap_in, gap_out, margin = 34 * S, 74 * S, 28 * S
    horizontal = direction == "LR"
    # "across" axis holds nodes of one layer; "along" axis is the flow direction
    layer_across = {}
    layer_along = {}
    for i, lst in by_layer.items():
        if horizontal:
            layer_across[i] = sum(n.h for n in lst) + gap_in * (len(lst) - 1)
            layer_along[i] = max(n.w for n in lst)
        else:
            layer_across[i] = sum(n.w for n in lst) + gap_in * (len(lst) - 1)
            layer_along[i] = max(n.h for n in lst)
    across_max = max(layer_across.values())
    cursor = margin
    for i in sorted(by_layer):
        start = margin + (across_max - layer_across[i]) / 2
        pos = start
        for nd in by_layer[i]:
            if horizontal:
                nd.x = cursor + (layer_along[i] - nd.w) / 2
                nd.y = pos
                pos += nd.h + gap_in
            else:
                nd.y = cursor + (layer_along[i] - nd.h) / 2
                nd.x = pos
                pos += nd.w + gap_in
        cursor += layer_along[i] + gap_out
    along_total = cursor - gap_out + margin
    W = int((along_total if horizontal else across_max + 2 * margin))
    H = int((across_max + 2 * margin if horizontal else along_total))

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # ports: spread connection points along the node side
    out_edges: dict[str, list] = {n: [] for n in nodes}
    in_edges: dict[str, list] = {n: [] for n in nodes}
    for idx, e in enumerate(edges):
        out_edges[e.a].append(idx)
        in_edges[e.b].append(idx)

    def key(n, idx_list, which):
        def k(idx):
            e = edges[idx]
            o = nodes[e.b if which == "out" else e.a]
            return o.y if horizontal else o.x
        return sorted(idx_list, key=k)

    port_out, port_in = {}, {}
    for n in nodes:
        lst = key(n, out_edges[n], "out")
        for r, idx in enumerate(lst):
            port_out[idx] = (r + 1) / (len(lst) + 1)
        lst = key(n, in_edges[n], "in")
        for r, idx in enumerate(lst):
            port_in[idx] = (r + 1) / (len(lst) + 1)

    ink, accent = (17, 24, 39), (79, 70, 229)

    def arrow_head(x, y, dx, dy, color):
        import math
        ang = math.atan2(dy, dx)
        L, wd = 11 * S, 5 * S
        p1 = (x - L * math.cos(ang) + wd * math.sin(ang), y - L * math.sin(ang) - wd * math.cos(ang))
        p2 = (x - L * math.cos(ang) - wd * math.sin(ang), y - L * math.sin(ang) + wd * math.cos(ang))
        d.polygon([(x, y), p1, p2], fill=color)

    def dashed(p, q, color, width):
        import math
        dx, dy = q[0] - p[0], q[1] - p[1]
        dist = math.hypot(dx, dy) or 1
        step, on = 14 * S, 8 * S
        t = 0
        while t < dist:
            a = (p[0] + dx * t / dist, p[1] + dy * t / dist)
            b = (p[0] + dx * min(t + on, dist) / dist, p[1] + dy * min(t + on, dist) / dist)
            d.line([a, b], fill=color, width=width)
            t += step

    labels = []
    for idx, e in enumerate(edges):
        a, b = nodes[e.a], nodes[e.b]
        if horizontal:
            p = (a.x + a.w, a.y + a.h * port_out[idx])
            q = (b.x, b.y + b.h * port_in[idx])
            if b.layer <= a.layer:
                continue
            mid = (p[0] + q[0]) / 2
            pts = [p, (mid, p[1]), (mid, q[1]), q]
            last = (1, 0)
        else:
            p = (a.x + a.w * port_out[idx], a.y + a.h)
            q = (b.x + b.w * port_in[idx], b.y)
            if b.layer <= a.layer:
                continue
            mid = (p[1] + q[1]) / 2
            pts = [p, (p[0], mid), (q[0], mid), q]
            last = (0, 1)
        color = (100, 108, 130)
        for u, v in zip(pts, pts[1:]):
            if e.dotted:
                dashed(u, v, color, 2 * S)
            else:
                d.line([u, v], fill=color, width=2 * S)
        arrow_head(q[0], q[1], last[0], last[1], color)
        if e.label:
            labels.append((e.label, pts))

    for nd in nodes.values():
        x0, y0, x1, y1 = nd.x, nd.y, nd.x + nd.w, nd.y + nd.h
        if nd.shape == "db":
            fill, line = (236, 253, 245), (5, 150, 105)
            d.rounded_rectangle([x0, y0, x1, y1], radius=14 * S, fill=fill, outline=line, width=2 * S)
            d.arc([x0, y0 - 2 * S, x1, y0 + 16 * S], 0, 180, fill=line, width=2 * S)
        elif nd.shape == "decision":
            fill, line = (255, 247, 237), (234, 88, 12)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            d.polygon([(cx, y0), (x1, cy), (cx, y1), (x0, cy)], fill=fill, outline=line)
            d.line([(cx, y0), (x1, cy), (cx, y1), (x0, cy), (cx, y0)], fill=line, width=2 * S)
        else:
            fill, line = (238, 242, 255), accent
            d.rounded_rectangle([x0, y0, x1, y1], radius=12 * S, fill=fill, outline=line, width=2 * S)
        ty = y0 + (nd.h - len(nd.lines) * line_h) / 2
        for t in nd.lines:
            tw = d.textlength(t, font=f_reg)
            d.text(((x0 + x1) / 2 - tw / 2, ty + 1 * S), t, font=f_reg, fill=ink)
            ty += line_h

    for text, pts in labels:
        # place the label on the middle segment
        u, v = pts[1], pts[2]
        mx, my = (u[0] + v[0]) / 2, (u[1] + v[1]) / 2
        tw = d.textlength(text, font=f_small)
        d.rectangle([mx - tw / 2 - 4 * S, my - 9 * S, mx + tw / 2 + 4 * S, my + 9 * S], fill="white")
        d.text((mx - tw / 2, my - 8 * S), text, font=f_small, fill=(55, 65, 81))

    if S > 1:
        img = img.resize((W // S * 1, H // S * 1), Image.LANCZOS) if False else img
    img.save(path, "PNG", optimize=True)
    return W, H
