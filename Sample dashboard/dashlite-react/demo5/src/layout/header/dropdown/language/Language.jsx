import React, {useState} from "react";
import EnglishFlag from "@/images/flags/english-sq.png";
import { DropdownToggle, Dropdown } from "reactstrap";
import { LangDropdown, UserAvatar } from "@/components/Component";
import { useThemeUpdate } from "@/layout/provider/Theme";

const LanguageHead = () => {
  const themeUpdate = useThemeUpdate();
  const [open, setOpen] = useState(false);
  const toggle = () => {
    themeUpdate.sidebarHide();
    setOpen((prevState) => !prevState)
  };
  return (
    <Dropdown isOpen={open} toggle={toggle}>
      <DropdownToggle
        tag="a"
        href="#toggle"
        onClick={(ev) => ev.preventDefault()}
        className="dropdown-toggle nk-quick-nav-icon"
      >
        <UserAvatar className="border border-light xs">
          <img src={EnglishFlag} alt="" />
        </UserAvatar>
      </DropdownToggle>
      <LangDropdown className="dropdown-menu-s1" />
    </Dropdown>
  );
};

export default LanguageHead;
