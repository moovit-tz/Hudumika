import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";

const BlankPage = ({ ...props }) => {
  return (
    <>
      <Head title="Blank Page" />
      <Content>
        <p>Starter Page for general layout</p>
      </Content>
    </>
  );
};

export default BlankPage;
