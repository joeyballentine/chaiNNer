import { Menu, MenuButton, Portal } from '@chakra-ui/react';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { noop } from '../../common/util';
import { useIpcRendererListener } from '../hooks/useIpcRendererListener';

interface MenuRendererProps {
    menuId: string;
    isOpen: boolean;
    position: readonly [x: number, y: number];
    onCloseHandler: () => void;
    render?: () => JSX.Element;
}

const MenuRenderer = memo(
    ({ menuId, isOpen, position, onCloseHandler, render }: MenuRendererProps) => {
        return (
            <Portal>
                <Menu
                    autoSelect
                    closeOnBlur
                    closeOnSelect
                    gutter={0}
                    id={menuId}
                    isOpen={isOpen}
                    onClose={onCloseHandler}
                >
                    <MenuButton
                        aria-hidden
                        h={0}
                        style={{
                            position: 'absolute',
                            left: position[0],
                            top: position[1],
                            cursor: 'default',
                        }}
                        w={0}
                    />
                    {render?.()}
                </Menu>
            </Portal>
        );
    }
);

interface ContentMenu {
    registerContextMenu: (id: string, render: () => JSX.Element) => void;
    unregisterContextMenu: (id: string) => void;
    openContextMenu: (id: string, x: number, y: number) => void;
    closeContextMenu: () => void;
}

export const ContextMenuContext = createContext<Readonly<ContentMenu>>({
    registerContextMenu: noop,
    unregisterContextMenu: noop,
    openContextMenu: noop,
    closeContextMenu: noop,
});

const EMPTY_MENUS: ReadonlyMap<string, () => JSX.Element> = new Map();

export const ContextMenuProvider = ({ children }: React.PropsWithChildren<unknown>) => {
    const [menus, setMenus] = useState(EMPTY_MENUS);
    const [current, setCurrent] = useState<string | undefined>();
    const [position, setPosition] = useState<readonly [number, number]>([0, 0]);

    const registerContextMenu = useCallback(
        (id: string, render: () => JSX.Element) => {
            setMenus((prev) => {
                const copy = new Map(prev);
                copy.set(id, render);
                return copy;
            });
        },
        [setMenus]
    );
    const unregisterContextMenu = useCallback(
        (id: string) => {
            setMenus((prev) => {
                const copy = new Map(prev);
                copy.delete(id);
                return copy;
            });
        },
        [setMenus]
    );

    const openContextMenu = useCallback(
        (id: string, x: number, y: number) => {
            setCurrent(id);
            setPosition([x, y]);
        },
        [setCurrent, setPosition]
    );
    const closeContextMenu = useCallback(() => {
        setCurrent(undefined);
    }, [setCurrent]);

    const menuId = 'global-context-menu';

    useEffect(() => {
        const mouseDownListener = (e: Event) => {
            if (e.target instanceof Element) {
                // eslint-disable-next-line prefer-destructuring
                for (let target: Element | null = e.target; target; ) {
                    if (target.id === `menu-list-${menuId}`) return;
                    target = target.parentElement;
                }
                closeContextMenu();
            }
        };

        window.addEventListener('contextmenu', closeContextMenu);
        window.addEventListener('dragover', closeContextMenu);
        window.addEventListener('resize', closeContextMenu);
        window.addEventListener('mousedown', mouseDownListener);
        return () => {
            window.removeEventListener('contextmenu', closeContextMenu);
            window.removeEventListener('dragover', closeContextMenu);
            window.removeEventListener('resize', closeContextMenu);
            window.removeEventListener('mousedown', mouseDownListener);
        };
    }, [closeContextMenu]);

    useIpcRendererListener('window-blur', closeContextMenu, [closeContextMenu]);

    let value: ContentMenu = {
        registerContextMenu,
        unregisterContextMenu,
        openContextMenu,
        closeContextMenu,
    };
    value = useMemo(() => value, Object.values(value));

    const currentRender = current !== undefined ? menus.get(current) : undefined;

    return (
        <ContextMenuContext.Provider value={value}>
            {children}
            <MenuRenderer
                isOpen={currentRender !== undefined}
                menuId={menuId}
                position={position}
                render={currentRender}
                onCloseHandler={closeContextMenu}
            />
        </ContextMenuContext.Provider>
    );
};
