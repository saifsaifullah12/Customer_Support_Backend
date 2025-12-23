import {
  moderationScorer,
  responseLengthScorer,
  billingKeywordScorer,
} from "./liveScorers";
import { supportQualityScorer } from "./judgeScorer";

export const liveEvalConfig = {
  triggerSource: "production",
  environment: "local-dev",

  sampling: { type: "ratio", rate: 1 } as const,

  scorers: {
    // AI-powered quality judge (primary scorer)
    supportQuality: {
      scorer: supportQualityScorer,
      sampling: { type: "ratio", rate: 1 } as const,
    },

    // Keep existing scorers as supplementary metrics
    moderation: {
      scorer: moderationScorer,
      sampling: { type: "ratio", rate: 1 } as const,
    },

    responseLength: {
      scorer: responseLengthScorer,
      sampling: { type: "ratio", rate: 1 } as const,
    },

    billingKeyword: {
      scorer: billingKeywordScorer,
      sampling: { type: "ratio", rate: 0.5 } as const,
    },
  },
};