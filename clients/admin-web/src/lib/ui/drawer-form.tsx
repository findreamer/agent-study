'use client';

import { useRef } from 'react';
import { Button, Drawer } from '@heroui/react';

interface DrawerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 面板宽度 px，简单表单 480 / 复杂表单 640 */
  width?: number;
  footerLoading?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}

/** 通用右侧 Drawer 表单壳：固定 Header/Body/Footer，Esc 关闭、自动焦点管理。 */
export function DrawerForm({
  open,
  onOpenChange,
  title,
  width = 480,
  footerLoading = false,
  onSubmit,
  children,
}: DrawerFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog
            style={{ width: `min(${width}px, 100vw)` }}
            className="flex flex-col"
          >
            <Drawer.CloseTrigger aria-label="关闭" />
            <Drawer.Header>
              <Drawer.Heading className="text-base font-semibold text-foreground">
                {title}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <form
                ref={formRef}
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
                className="flex flex-col gap-4"
              >
                {children}
              </form>
            </Drawer.Body>
            <Drawer.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <Button
                isPending={footerLoading}
                isDisabled={footerLoading}
                onPress={() => formRef.current?.requestSubmit()}
              >
                确定
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
