/**
 * Scientific starter templates for p2pmd (Markdown-only).
 */

export const TEMPLATES = [
  {
    id: "research-paper-md",
    label: "Research Paper",
    description: "Journal-style markdown template with KaTeX equations and table",
    slideTemplate: false,
    ieeeMode: true,
    content: `<!-- ieee -->

## Lorem Ipsum: A Sample Research Paper

**Author One** [1]  \n**Author Two** [1]  \n**Author Three** [2]  \n**Author Four** [2]

[1] Lorem University  \n[1] Ipsum Labs  \n[2] Sit Amet Corp  \n[2] Sit Amet Corp

author.one@lorem.edu  \nauthor.two@lorem.edu  \nauthor.three@ipsum.org  \nauthor.four@ipsum.org

### Abstract

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

### 1. Introduction

Sed ut *perspiciatis* unde omnis iste natus error sit voluptatem accusantium doloremque laudantium. **Totam rem aperiam**, eaque ipsa quae ab illo inventore veritatis et quasi [architecto beatae](https://republic.p2plabs.xyz/) vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.

#### 1.1 Background

Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet. Consectetur adipisci velit sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

### 2. Method

We define the throughput metric as:

$$
T = \\frac{N_{ops}}{\\Delta t} \\cdot \\eta
$$

where $N_{ops}$ is total operations, $\\Delta t$ is elapsed time, and $\\eta$ is the efficiency coefficient.

### 3. Results

| Model | Accuracy | Latency (ms) | Throughput |
| --- | ---: | ---: | ---: |
| Baseline | 78.2% | 142 | 1.0x |
| Proposed | 91.5% | 87 | 1.6x |
| Optimized | 93.1% | 64 | 2.1x |

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

![Fig. 1: Server-based network topology](https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Server-based-network.svg/1280px-Server-based-network.svg.png)

\`\`\`
Client --> Gateway --> Scheduler
                        |
                   Worker Pool
\`\`\`
*Fig. 2: Request processing pipeline*

### 4. Conclusion

Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam nisi ut aliquid ex ea commodi consequatur.

### References

- [1] Lorem, I. (2025). *Dolor Sit Amet.* Journal of Ipsum Studies.
- [2] Consectetur, A. (2024). *Adipiscing Elit.* Proceedings of Sed.
`
  },
  {
    id: "technical-doc-md",
    label: "Technical Documentation",
    description: "Implementation-focused markdown template with API table and math",
    slideTemplate: false,
    ieeeMode: false,
    content: `## Technical Documentation: P2P Sync Service

### Overview

This document describes the sync protocol, expected request/response shapes,
and operational safeguards for the P2P markdown collaboration service.

### Quick Start

1. Create room
2. Join with key
3. Stream incremental updates

### API Surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| /api/room | POST | Create or join room |
| /api/update | POST | Push incremental update |
| /api/events | GET (SSE) | Receive remote updates |

### Throughput Estimate

$$
R = \\frac{B}{S}
$$

where $R$ is updates/sec, $B$ is network bandwidth, and $S$ is average payload size.

### Notes

- Keep payloads small and incremental.
- Retry idempotent operations on transient failures.
- Log room events for debugging and auditability.
`
  }
];

/**
 * Replace editor content with a selected template.
 */
export function applyTemplate(templateId, inputEl, scheduleRender) {
  const selectedTemplate = TEMPLATES.find((item) => item.id === templateId);
  if (!selectedTemplate) return false;

  const hasExistingContent = (inputEl.value || "").trim().length > 0;
  if (hasExistingContent) {
    const confirmed = window.confirm("Replace current document with this template?");
    if (!confirmed) return false;
  }

  inputEl.value = selectedTemplate.content;
  const templateLineCount = (selectedTemplate.content.match(/\n/g) || []).length + 1;

  if (typeof window.attributeLocalLineRange === "function") {
    window.attributeLocalLineRange(1, templateLineCount, { reset: true });
  }

  if (!selectedTemplate.slideTemplate && window.isSlideMode && typeof window.exitSlideMode === "function") {
    window.exitSlideMode();
  }

  inputEl.focus();
  inputEl.setSelectionRange(0, 0);
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  scheduleRender();
  return true;
}
