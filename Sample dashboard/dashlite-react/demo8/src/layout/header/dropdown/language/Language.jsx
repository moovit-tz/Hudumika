import React from "react";
import EnglishFlag from "@/images/flags/english-sq.png";
import { DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { LangDropdown, UserAvatar } from "@/components/Component";

const LanguageHead = () => {
  return (
    <UncontrolledDropdown className="language-dropdown">
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
    </UncontrolledDropdown>
  );
};

export default LanguageHead;
