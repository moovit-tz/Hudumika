import React from "react";
import EnglishFlag from "@/images/flags/english-sq.png";
import { DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { LangDropdown, UserAvatar } from "@/components/Component";

const LanguageHead = () => {
  return (
    <UncontrolledDropdown>
      <DropdownToggle
        tag="a"
        href="#toggle"
        onClick={(ev) => ev.preventDefault()}
        className="dropdown-toggle nk-quick-nav-icon"
      >
        <div className="quick-icon border border-light">
          <img className="icon" src={EnglishFlag} alt="" />
        </div>
      </DropdownToggle>
      <LangDropdown />
    </UncontrolledDropdown>
  );
};

export default LanguageHead;
