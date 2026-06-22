import React from "react";
import EnglishFlag from "@/images/flags/english.png";
import SpanishFlag from "@/images/flags/spanish.png";
import FrenchFlag from "@/images/flags/french.png";
import TurkeyFlag from "@/images/flags/turkey.png";
import { DropdownItem, DropdownMenu } from "reactstrap";

const LangDropdown = ({ className, size }) => {
  return (
    <DropdownMenu end className={`${size ? `dropdown-menu-${size}` : ""} ${className ? className : ""}`}>
      <ul className="language-list">
        <li>
          <DropdownItem tag="a" href="#item" className="language-item" onClick={(ev) => ev.preventDefault()}>
            <img src={EnglishFlag} alt="" className="language-flag" />
            <span className="language-name">English</span>
          </DropdownItem>
        </li>
        <li>
          <DropdownItem tag="a" href="#item" className="language-item" onClick={(ev) => ev.preventDefault()}>
            <img src={SpanishFlag} alt="" className="language-flag" />
            <span className="language-name">Spanish</span>
          </DropdownItem>
        </li>
        <li>
          <DropdownItem tag="a" href="#item" className="language-item" onClick={(ev) => ev.preventDefault()}>
            <img src={FrenchFlag} alt="" className="language-flag" />
            <span className="language-name">French</span>
          </DropdownItem>
        </li>
        <li>
          <DropdownItem tag="a" href="#item" className="language-item" onClick={(ev) => ev.preventDefault()}>
            <img src={TurkeyFlag} alt="" className="language-flag" />
            <span className="language-name">Turkish</span>
          </DropdownItem>
        </li>
      </ul>
    </DropdownMenu>
  );
};

export default LangDropdown;
