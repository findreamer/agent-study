import { tool, type StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const VAGUE_WORDS = [
  '尽量',
  '大约',
  '尽快',
  '合适',
  '较好',
  '若干',
  '相关',
] as const;

const ENTITY_GLOSSARY: Record<string, string> = {
  用户: '系统的最终操作者，通过注册流程获得账号',
  手机号: '用户的唯一联系方式，注册时绑定并用于登录验证',
  密码: '账号登录凭据，注册时设置，长度至少 8 位',
  短信: '发送验证码的通道，依赖手机号',
  验证码: '一次性校验码，通过短信下发，有效期通常 5 分钟',
  报表: '系统按维度聚合的统计数据视图，可配置后导出',
  excel: '常见的报表导出文件格式，兼容 xlsx',
};

function checkConstraint(constraint: string): string {
  const trimmed = constraint.trim();
  if (trimmed.length < 4) {
    return JSON.stringify({
      valid: false,
      reason: '表述过短，缺少可执行的细节',
    });
  }
  const vague = VAGUE_WORDS.find((word) => trimmed.includes(word));
  if (vague) {
    return JSON.stringify({
      valid: false,
      reason: `含模糊措辞「${vague}」，建议改为可量化的验收标准`,
    });
  }
  if (/\d/.test(trimmed)) {
    return JSON.stringify({
      valid: true,
      reason: '包含可量化指标，可直接作为验收标准',
    });
  }
  return JSON.stringify({
    valid: true,
    reason: '表述明确，建议补充量化指标以便验收',
  });
}

function lookupEntity(entity: string): string {
  const key = entity.trim();
  const hit =
    ENTITY_GLOSSARY[key] ??
    Object.entries(ENTITY_GLOSSARY).find(([name]) => key.includes(name))?.[1];
  return JSON.stringify({
    entity: key,
    definition: hit ?? '词表中未收录该实体，请向需求方确认其定义',
  });
}

export const checkConstraintValidity = tool(
  ({ constraint }) => checkConstraint(constraint),
  {
    name: 'check_constraint_validity',
    description:
      '校验一条需求约束的表述质量：是否含量化指标、是否存在模糊措辞，返回 valid 与改进建议',
    schema: z.object({
      constraint: z.string().describe('待校验的约束描述，例如：密码至少8位'),
    }),
  },
);

export const lookupEntityDefinition = tool(
  ({ entity }) => lookupEntity(entity),
  {
    name: 'lookup_entity_definition',
    description:
      '查询业务实体（用户、手机号、报表等）的标准定义，未收录时明确提示',
    schema: z.object({
      entity: z.string().describe('实体名称，例如：手机号'),
    }),
  },
);

export const basicTools = [checkConstraintValidity, lookupEntityDefinition];

export const basicToolsByName: Record<string, StructuredTool> = {
  [checkConstraintValidity.name]: checkConstraintValidity,
  [lookupEntityDefinition.name]: lookupEntityDefinition,
};
