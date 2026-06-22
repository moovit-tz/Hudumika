import React from "react";
import classNames from "classnames";
import SimpleBar from "simplebar-react";
import Menu from "../menu/Menu";
import MenuSm from "../menu/MenuSm";

import { useTheme, useThemeUpdate } from "@/layout/provider/Theme";

const Sidebar = ({ className, menuData, smMenuData }) => {

  const theme = useTheme();
  const themeUpdate = useThemeUpdate();

  const classes = classNames({
    "nk-aside toggle-screen-lg": true,
    "content-active": theme.sidebarVisibility,
    "mobile-menu": theme.sidebarMobile,
    [`${className}`]: className,
  });

  return (
    <>
    <div className={classes}>
      <SimpleBar className="nk-sidebar-menu">
        <Menu data={menuData} />
        {smMenuData && <MenuSm className="nk-menu-sm" data={smMenuData} />}
      </SimpleBar>
    </div>
    {theme.sidebarVisibility && <div 
      onClick={themeUpdate.sidebarVisibility}
       className="toggle-overlay"></div>}
    </>
  );
};
export default Sidebar;
