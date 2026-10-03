import { checkConstraintValidity, lookupEntityDefinition } from './basic.tools.js';

describe('checkConstraintValidity', () => {
  it('量化约束判定为有效', async () => {
    const result = JSON.parse(
      await checkConstraintValidity.invoke({ constraint: '密码至少8位' }),
    );
    expect(result.valid).toBe(true);
  });

  it('模糊措辞判定为无效并指出原因', async () => {
    const result = JSON.parse(
      await checkConstraintValidity.invoke({ constraint: '尽快完成上线' }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('尽快');
  });

  it('过短表述判定为无效', async () => {
    const result = JSON.parse(
      await checkConstraintValidity.invoke({ constraint: '要快' }),
    );
    expect(result.valid).toBe(false);
  });
});

describe('lookupEntityDefinition', () => {
  it('命中词表返回定义', async () => {
    const result = JSON.parse(
      await lookupEntityDefinition.invoke({ entity: '手机号' }),
    );
    expect(result.definition).toContain('联系方式');
  });

  it('未收录实体明确提示', async () => {
    const result = JSON.parse(
      await lookupEntityDefinition.invoke({ entity: '曲率引擎' }),
    );
    expect(result.definition).toContain('未收录');
  });
});
