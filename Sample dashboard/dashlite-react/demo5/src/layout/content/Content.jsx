import React from "react";

const Content = ({ ...props }) => {
  return (
    <div className="nk-content nk-content-fluid">
      <div className="container-xl wide-lg">
        <div className="nk-content-body">
          {!props.page ? props.children : null}
          {props.page === "component" ? (
            <div className="components-preview wide-md mx-auto">{props.children}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
export default Content;
