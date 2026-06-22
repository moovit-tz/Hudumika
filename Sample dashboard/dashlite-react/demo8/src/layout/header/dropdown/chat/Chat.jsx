import React, { useState } from "react";
import { Dropdown, DropdownMenu, DropdownToggle } from "reactstrap";
import { Icon } from "@/components/Component";
import { ChatItemHeader } from "@/pages/app/chat/ChatPartials";
import { chatData } from "@/pages/app/chat/ChatData";
import { Link } from "react-router-dom";

const ChatDropdown = () => {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen(!open);
  };
  return (
    <Dropdown isOpen={open} toggle={toggle}>
      <DropdownToggle tag="a" href="#dropdown" onClick={(ev) => ev.preventDefault()} className="nk-quick-nav-icon">
        <div className="icon-status icon-status-na">
          <Icon name="comments"></Icon>
        </div>
      </DropdownToggle>
      <DropdownMenu end className="dropdown-menu-xl">
        <div className="dropdown-head" onClick={() => toggle()}>
          <span className="sub-title nk-dropdown-title">Recent Chats</span>
          <Link to={`/user-profile-setting`}>Setting</Link>
        </div>
        <div className="dropdown-body">
          <ul className="chat-list">
            {chatData.map((item, i) => {
              return item.convo.length > 0 && !item.group && <ChatItemHeader key={i} item={item} toggle={toggle} />;
            })}
          </ul>
        </div>
        <div className="dropdown-foot center" onClick={() => toggle()}>
          <Link to={`/app-chat`}>View All</Link>
        </div>
      </DropdownMenu>
    </Dropdown>
  );
};

export default ChatDropdown;
