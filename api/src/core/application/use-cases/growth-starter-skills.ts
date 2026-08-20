import { GrowthProgressKind } from '@core/domain/enums';

export const STARTER_SKILL_KEYS = {
  attributeGeneral: 'attribute-general',
  attributeIntelligence: 'attribute-intelligence',
  attributeStrength: 'attribute-strength',
  attributeDexterity: 'attribute-dexterity',
  attributeResilience: 'attribute-resilience',
  attributeCreativity: 'attribute-creativity',
  attributeCharisma: 'attribute-charisma',
  legacyCreativity: 'creativity',
  skillProgramming: 'skill-programming',
  skillWriting: 'skill-writing',
  skillLanguage: 'skill-language',
  skillArt: 'skill-art',
  skillFitness: 'skill-fitness',
  skillCooking: 'skill-cooking',
} as const;

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
    key: STARTER_SKILL_KEYS.attributeGeneral,
    name: 'General',
    description: 'Progress that applies across every kind of task.',
    icon: 'SPARKLES',
    color: 'TEAL',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeIntelligence,
    name: 'Intelligence',
    description: 'Learning, reasoning, research, and problem-solving.',
    icon: 'BRAIN',
    color: 'VIOLET',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeStrength,
    name: 'Strength',
    description: 'Power, discipline, physical effort, and carrying hard things through.',
    icon: 'DUMBBELL',
    color: 'EMERALD',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeDexterity,
    name: 'Dexterity',
    description: 'Coordination, precision, speed, and hands-on practice.',
    icon: 'CROSSHAIR',
    color: 'EMERALD',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeResilience,
    name: 'Resilience',
    description: 'Recovery, consistency, adaptability, and handling pressure.',
    icon: 'SHIELD',
    color: 'ROSE',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeCreativity,
    name: 'Creativity',
    description: 'Original thinking, imagination, design, and making.',
    icon: 'LIGHTBULB',
    color: 'AMBER',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.attributeCharisma,
    name: 'Charisma',
    description: 'Communication, empathy, confidence, and relationships.',
    icon: 'MESSAGE_CIRCLE',
    color: 'TEAL',
    kind: GrowthProgressKind.ATTRIBUTE,
  },
  {
    key: STARTER_SKILL_KEYS.skillProgramming,
    name: 'Programming',
    description: 'Building software and strengthening technical fluency.',
    icon: 'CODE_2',
    color: 'VIOLET',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: STARTER_SKILL_KEYS.skillWriting,
    name: 'Writing',
    description: 'Clear, thoughtful, and expressive written communication.',
    icon: 'PEN_LINE',
    color: 'ROSE',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: STARTER_SKILL_KEYS.skillLanguage,
    name: 'Language',
    description: 'Vocabulary, comprehension, speaking, and listening.',
    icon: 'LANGUAGES',
    color: 'BLUE',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: STARTER_SKILL_KEYS.skillArt,
    name: 'Art',
    description: 'Visual expression, craft, and creative technique.',
    icon: 'PALETTE',
    color: 'AMBER',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: STARTER_SKILL_KEYS.skillFitness,
    name: 'Fitness',
    description: 'Strength, mobility, endurance, and physical wellbeing.',
    icon: 'DUMBBELL',
    color: 'EMERALD',
    kind: GrowthProgressKind.SKILL,
  },
  {
    key: STARTER_SKILL_KEYS.skillCooking,
    name: 'Cooking',
    description: 'Kitchen technique, nutrition, and confident meal-making.',
    icon: 'COOKING_POT',
    color: 'ORANGE',
    kind: GrowthProgressKind.SKILL,
  },
];

export interface StarterMappingRoute {
  skillKey: string;
  primaryKey: string;
  secondaryKey: string;
  primaryWeight: number;
  secondaryWeight: number;
}

export const STARTER_ATTRIBUTE_MAPPING_ROUTES: StarterMappingRoute[] = [
  {
    skillKey: STARTER_SKILL_KEYS.skillProgramming,
    primaryKey: STARTER_SKILL_KEYS.attributeIntelligence,
    secondaryKey: STARTER_SKILL_KEYS.attributeCreativity,
    primaryWeight: 80,
    secondaryWeight: 20,
  },
  {
    skillKey: STARTER_SKILL_KEYS.skillWriting,
    primaryKey: STARTER_SKILL_KEYS.attributeCreativity,
    secondaryKey: STARTER_SKILL_KEYS.attributeCharisma,
    primaryWeight: 70,
    secondaryWeight: 30,
  },
  {
    skillKey: STARTER_SKILL_KEYS.skillFitness,
    primaryKey: STARTER_SKILL_KEYS.attributeStrength,
    secondaryKey: STARTER_SKILL_KEYS.attributeResilience,
    primaryWeight: 70,
    secondaryWeight: 30,
  },
  {
    skillKey: STARTER_SKILL_KEYS.skillCooking,
    primaryKey: STARTER_SKILL_KEYS.attributeDexterity,
    secondaryKey: STARTER_SKILL_KEYS.attributeCreativity,
    primaryWeight: 70,
    secondaryWeight: 30,
  },
  {
    skillKey: STARTER_SKILL_KEYS.skillLanguage,
    primaryKey: STARTER_SKILL_KEYS.attributeIntelligence,
    secondaryKey: STARTER_SKILL_KEYS.attributeCharisma,
    primaryWeight: 70,
    secondaryWeight: 30,
  },
];
