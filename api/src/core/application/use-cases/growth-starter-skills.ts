import { GrowthProgressKind } from '@prisma/client';

export interface StarterSkillDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: GrowthProgressKind;
}

export const STARTER_SKILLS: StarterSkillDefinition[] = [
  {
    key: 'attribute-general',
    name: 'General',
    description: 'Progress that applies across every kind of task.',
    icon: 'SPARKLES',
    color: 'TEAL',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-intelligence',
    name: 'Intelligence',
    description: 'Learning, reasoning, research, and problem-solving.',
    icon: 'BRAIN',
    color: 'VIOLET',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-strength',
    name: 'Strength',
    description: 'Power, discipline, physical effort, and carrying hard things through.',
    icon: 'DUMBBELL',
    color: 'EMERALD',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-dexterity',
    name: 'Dexterity',
    description: 'Coordination, precision, speed, and hands-on practice.',
    icon: 'CROSSHAIR',
    color: 'EMERALD',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-resilience',
    name: 'Resilience',
    description: 'Recovery, consistency, adaptability, and handling pressure.',
    icon: 'SHIELD',
    color: 'ROSE',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-creativity',
    name: 'Creativity',
    description: 'Original thinking, imagination, design, and making.',
    icon: 'LIGHTBULB',
    color: 'AMBER',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'attribute-charisma',
    name: 'Charisma',
    description: 'Communication, empathy, confidence, and relationships.',
    icon: 'MESSAGE_CIRCLE',
    color: 'TEAL',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: 'skill-programming',
    name: 'Programming',
    description: 'Building software and strengthening technical fluency.',
    icon: 'CODE_2',
    color: 'VIOLET',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: 'skill-writing',
    name: 'Writing',
    description: 'Clear, thoughtful, and expressive written communication.',
    icon: 'PEN_LINE',
    color: 'ROSE',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: 'skill-language',
    name: 'Language',
    description: 'Vocabulary, comprehension, speaking, and listening.',
    icon: 'LANGUAGES',
    color: 'BLUE',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: 'skill-art',
    name: 'Art',
    description: 'Visual expression, craft, and creative technique.',
    icon: 'PALETTE',
    color: 'AMBER',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: 'skill-fitness',
    name: 'Fitness',
    description: 'Strength, mobility, endurance, and physical wellbeing.',
    icon: 'DUMBBELL',
    color: 'EMERALD',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: 'skill-cooking',
    name: 'Cooking',
    description: 'Kitchen technique, nutrition, and confident meal-making.',
    icon: 'COOKING_POT',
    color: 'ORANGE',
    kind: GrowthProgressKind.SKILL,
  },
];
