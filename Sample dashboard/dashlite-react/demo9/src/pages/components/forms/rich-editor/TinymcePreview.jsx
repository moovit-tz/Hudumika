import React, { useRef } from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import { Editor } from "@tinymce/tinymce-react";
import { useTheme } from '@/layout/provider/Theme';
// TinyMCE so the global var exists
import 'tinymce/tinymce';
// DOM model
import 'tinymce/models/dom/model'
// Theme
import 'tinymce/themes/silver';
// Toolbar icons
import 'tinymce/icons/default';

// Content styles, including inline UI like fake cursors
import 'tinymce/skins/content/default/content';

import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  BackTo,
  PreviewCard,
  CodeBlock,
} from "@/components/Component";

const TinymcePreview = () => {
  const theme = useTheme();

  return (
    <React.Fragment>
      <Head title="Tinymce" />
      <Content page="component">
        <BlockHead size="lg" wide="sm">
          <BlockHeadContent>
            <BackTo link="/components" icon="arrow-left">
              Components
            </BackTo>
            <BlockTitle tag="h2" className="fw-normal">
              Tinymce Editor
            </BlockTitle>
            <BlockDes>
              <p className="lead">
                Using the{" "}
                <a href="https://www.tiny.cloud/" target="_blank" rel="noreferrer">
                  Tinymce
                </a>{" "}
                plugin, you can simply make some awesome rich text editor.
              </p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Default settings Editor</BlockTitle>
              <BlockDes>
                <p>Tinymce rich text editor with default options.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            {" "}
            <Editor
              licenseKey='gpl'
              initialValue="<p>This is the initial content of the editor.</p>"
              init={{
                menubar: "file edit view format",
                toolbar:
                  "undo redo | formatselect | " +
                  "bold italic | alignleft aligncenter " +
                  "alignright alignjustify | outdent indent",
                content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
              }}
            />
          </PreviewCard>
          <CodeBlock>{`<Editor
    licenseKey='gpl'
    initialValue="<p>This is the initial content of the editor.</p>"
    init={{
    menubar: "file edit view format",
    toolbar:
        "undo redo | formatselect | " +
        "bold italic | alignleft aligncenter " +
        "alignright alignjustify | outdent indent",
    content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
    }}
/>`}</CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">With Menubar Editor</BlockTitle>
              <p>Tinymce rich text editor with only menubar.</p>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            {" "}
            <Editor
              licenseKey='gpl'
              initialValue="<p>This is the initial content of the editor.</p>"
              init={{
                menubar: "file edit view format",
                toolbar: false,
                content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
              }}
            />
          </PreviewCard>
          <CodeBlock>{`<Editor
    licenseKey='gpl'
    initialValue="<p>This is the initial content of the editor.</p>"
    init={{
    menubar: "file edit view format",
    toolbar: false,
    content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
    }}
/>`}</CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">With Toolbar Editor</BlockTitle>
              <p>Tinymce rich text editor with only toolbar.</p>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            {" "}
            <Editor
              licenseKey='gpl'
              initialValue="<p>This is the initial content of the editor.</p>"
              init={{
                menubar: false,
                toolbar:
                  "undo redo | formatselect | " +
                  "bold italic | alignleft aligncenter " +
                  "alignright alignjustify | outdent indent",
                content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
              }}
            />
          </PreviewCard>
          <CodeBlock>{` <Editor
    licenseKey='gpl'
    initialValue="<p>This is the initial content of the editor.</p>"
    init={{
    menubar: false,
    toolbar:
        "undo redo | formatselect | " +
        "bold italic | alignleft aligncenter " +
        "alignright alignjustify | outdent indent",
    content_style: theme.skin == 'dark' ? 'body { color:#fff }' : 'body { color:#000 }'
    }}
/>`}</CodeBlock>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default TinymcePreview;
