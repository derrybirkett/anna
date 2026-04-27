import { callClaude } from "./claude";
import {
  getCurrentTopic,
  incrementTopicIndex,
  saveMarkdown,
  slugify,
} from "./content";

export interface WorkflowResult {
  success: boolean;
  slug?: string;
  error?: string;
}

export async function runWeeklyWorkflow(
  customTopic?: string
): Promise<WorkflowResult> {
  try {
    const topic = customTopic || (await getCurrentTopic());
    const date = new Date().toISOString().split("T")[0];
    const slug = slugify(topic);

    console.log(`Starting workflow for topic: ${topic}`);

    console.log("Step 1: Research");
    const researchPrompt = `You are a systems thinking researcher. Research the following topic in depth:

Topic: ${topic}

Provide:
- Key concepts and definitions
- Major theories and frameworks
- Notable practitioners and thought leaders
- Real-world examples and case studies
- Current trends and developments

Be thorough and academic in your research. Aim for 800-1000 words.`;

    const research = await callClaude(researchPrompt);
    await saveMarkdown(date, slug, "research.md", research);
    console.log("Research complete");

    console.log("Step 2: Synthesis");
    const synthesisPrompt = `Based on the research above, synthesize the key insights:

- Identify patterns and connections
- Extract core principles
- Highlight practical implications
- Note tensions or contradictions
- Suggest areas for deeper exploration

Aim for 500-700 words of clear, structured synthesis.`;

    const synthesis = await callClaude(synthesisPrompt, research);
    await saveMarkdown(date, slug, "synthesis.md", synthesis);
    console.log("Synthesis complete");

    console.log("Step 3: Article");
    const articlePrompt = `Write a compelling 1000-word article for systems thinking practitioners based on the synthesis above.

Requirements:
- Start with an engaging hook
- Use clear examples and analogies
- Make it practical and actionable
- Write in an accessible but intelligent tone
- Include concrete takeaways

Format the response as markdown with a title. Include frontmatter at the top:
---
title: "Your Article Title Here"
date: "${date}"
topic: "${topic}"
---

Then write the article body.`;

    const article = await callClaude(articlePrompt, synthesis);
    await saveMarkdown(date, slug, "article.md", article);
    console.log("Article complete");

    console.log("Step 4: Workshop");
    const workshopPrompt = `Create a 90-minute workshop based on the article above.

Include:
- Learning objectives (3-4)
- Opening activity (10-15 min)
- Main concepts presentation (20-25 min)
- Interactive exercise or discussion (30-40 min)
- Application activity (15-20 min)
- Closing reflection (5-10 min)

Provide specific instructions for each section, including:
- Facilitator notes
- Discussion prompts
- Exercise instructions
- Materials needed

Aim for 800-1000 words.`;

    const workshop = await callClaude(workshopPrompt, article);
    await saveMarkdown(date, slug, "workshop.md", workshop);
    console.log("Workshop complete");

    if (!customTopic) {
      await incrementTopicIndex();
      console.log("Topic index incremented");
    }

    return {
      success: true,
      slug: `${date}-${slug}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Workflow failed:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
