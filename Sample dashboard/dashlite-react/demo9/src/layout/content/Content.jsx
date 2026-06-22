import React from "react";

const Content = ({ ...props }) => {
  return (
    <div className="nk-content nk-content-fluid">
      <div className="container-xl wide-xl">
        <div className="nk-content-body">
          {!props.page ? props.children : null}
          {props.page === "component" ? (
            <div className="components-preview">{props.children}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
export default Content;
