import React, { useState } from "react";
import { Dropdown, DropdownMenu, DropdownToggle } from "reactstrap";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Component";
import { useThemeUpdate } from "@/layout/provider/Theme";

const AppDropdown = () => {
  const themeUpdate = useThemeUpdate();
  const [open, setOpen] = useState(false);
  const toggle = () => {
    themeUpdate.sidebarHide();
    setOpen(!open);
  };
  return (
    <Dropdown isOpen={open} toggle={toggle}>
      <DropdownToggle
        tag="a"
        href="#dropdown"
        onClick={(ev) => ev.preventDefault()}
        className="dropdown-toggle nk-quick-nav-icon"
      >
        <div className="icon-status icon-status-na">
          <Icon name="menu-circled"></Icon>
        </div>
      </DropdownToggle>
      <DropdownMenu end className="dropdown-menu-lg">
        <div className="dropdown-body">
          <ul className="list-apps">
            <li>
              <Link to="/" onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-primary text-white"></Icon>
                </span>
                <span className="list-apps-title">Dashboard</span>
              </Link>
            </li>
            <li>
              <Link to={`/app-chat`} onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-info-dim"></Icon>
                </span>
                <span className="list-apps-title">Chats</span>
              </Link>
            </li>
            <li>
              <Link to={`/app-messages`} onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-success-dim"></Icon>
                </span>
                <span className="list-apps-title">Messages</span>
              </Link>
            </li>
            <li>
              <Link to={`/app-calender`} onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-danger-dim"></Icon>
                </span>
                <span className="list-apps-title">Calender</span>
              </Link>
            </li>
            <li>
              <Link to={`/app-file-manager`} onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-success-dim"></Icon>
                </span>
                <span className="list-apps-title">File Manager</span>
              </Link>
            </li>
            <li>
              <Link to={`/components`} onClick={toggle}>
                <span className="list-apps-media">
                  <Icon name="dashlite" className="bg-secondary-dim"></Icon>
                </span>
                <span className="list-apps-title">Components</span>
              </Link>
            </li>
          </ul>
        </div>
      </DropdownMenu>
    </Dropdown>
  );
};

export default AppDropdown;
