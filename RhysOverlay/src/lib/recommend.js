/**
 * Rough, transparent heuristic - not a benchmark. Maps detected VRAM (falls
 * back to RAM if no discrete GPU is found) to a tier of models that
 * typically run comfortably at that memory budget. Ollama model names are
 * current as of early 2026; swap/extend this list as new models land.
 */

const TIERS = [
  {
    id: 'tiny',
    maxGB: 4,
    label: 'Light (≤4GB VRAM or CPU-only)',
    models: [
      { name: 'llama3.2:3b', note: 'Fast, small, good general assistant' },
      { name: 'phi3:mini', note: "Microsoft's compact model, strong for its size" },
      { name: 'qwen2.5:3b', note: 'Good coding/reasoning for a small model' },
    ],
  },
  {
    id: 'mid',
    maxGB: 8,
    label: 'Balanced (6-8GB VRAM)',
    models: [
      { name: 'llama3.1:8b', note: 'Great all-round default' },
      { name: 'mistral:7b', note: 'Fast, solid general chat' },
      { name: 'gemma2:9b', note: "Google's model, strong reasoning" },
    ],
  },
  {
    id: 'high',
    maxGB: 16,
    label: 'High (10-16GB VRAM)',
    models: [
      { name: 'qwen2.5:14b', note: 'Noticeably stronger coding/reasoning' },
      { name: 'codellama:13b', note: 'Specialized for code' },
      { name: 'llama3.1:8b', note: 'Runs very comfortably here too' },
    ],
  },
  {
    id: 'enthusiast',
    maxGB: Infinity,
    label: 'Enthusiast (16GB+ VRAM)',
    models: [
      { name: 'qwen2.5:32b', note: 'Large, high quality, needs the headroom' },
      { name: 'mixtral:8x7b', note: 'Mixture-of-experts, strong general performance' },
      { name: 'llama3.1:8b', note: 'Cheap fallback for quick answers' },
    ],
  },
];

function recommend({ vramGB, ramGB }) {
  const budgetGB = vramGB && vramGB > 0 ? vramGB : Math.max(2, Math.floor((ramGB || 8) / 2));
  const usingVram = !!(vramGB && vramGB > 0);
  const tier = TIERS.find((t) => budgetGB <= t.maxGB) || TIERS[TIERS.length - 1];

  return {
    tierId: tier.id,
    tierLabel: tier.label,
    basedOn: usingVram ? `${vramGB}GB VRAM detected` : `no discrete GPU detected, estimated from ${ramGB || '?'}GB RAM`,
    models: tier.models,
  };
}

module.exports = { recommend, TIERS };
