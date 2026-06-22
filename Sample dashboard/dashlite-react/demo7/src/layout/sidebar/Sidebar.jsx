import React, {useState} from "react";
import classNames from "classnames";
import SimpleBar from "simplebar-react";
import Menu from "../menu/Menu";
import Navside from "../navside/Navside";

import { useTheme, useThemeUpdate } from '@/layout/provider/Theme';

const Sidebar = ({ fixed, className, menuData }) => {

  
  const [currentMenuTab, setCurrentMenuTab] = useState("");
  
  const theme = useTheme();
  const themeUpdate = useThemeUpdate();

  const mainClass = classNames({
    "nk-sidebar-main": true,
    [`is-light`]: theme.sidebar === "white",
    [`is-${theme.sidebar}`]: theme.sidebar !== "white" && theme.sidebar !== "light",
    [`${className}`]: className,
  });

  const compClass = classNames({
    "nk-sidebar": true,
    "nk-sidebar-fixed": fixed,
    "nk-sidebar-mobile": theme.sidebarMobile,
    "nk-sidebar-active": theme.sidebarVisibility && theme.sidebarMobile,
  });

  return (
    <>
    <div className={compClass}>
      <Navside setCurrentMenuTab={setCurrentMenuTab} />
      <div className={mainClass}>
        <SimpleBar className="nk-sidebar-inner">
          <Menu currentMenuTab={currentMenuTab} data={menuData} />
        </SimpleBar>
      </div>
    </div>
    {theme.sidebarVisibility && <div 
      onClick={themeUpdate.sidebarVisibility}
       className="nk-sidebar-overlay"></div>}
    </>
  );
};
export default Sidebar;
