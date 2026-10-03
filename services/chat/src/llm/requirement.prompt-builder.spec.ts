import { buildRequirementPrompt } from './requirement.prompt-builder.js';
import {
  REQUIREMENT_SYSTEM_PROMPT,
  REQUIREMENT_USER_TEMPLATE,
} from './prompts/requirement.prompt.js';

describe('buildRequirementPrompt', () => {
  it('渲染 system + human 两条消息并替换 {input} 占位符', async () => {
    const messages = await buildRequirementPrompt().formatMessages({
      input: '用户注册时必须绑定手机号，密码至少8位',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[0].content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect(messages[1].getType()).toBe('human');
    expect(messages[1].content).toContain('用户注册时必须绑定手机号，密码至少8位');
    expect(messages[1].content).not.toContain('{input}');
  });

  it('USER 模板必须包含 {input} 占位符', () => {
    expect(REQUIREMENT_USER_TEMPLATE).toContain('{input}');
  });
});
