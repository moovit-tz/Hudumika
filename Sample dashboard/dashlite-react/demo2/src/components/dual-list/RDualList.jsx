import React, { useEffect, useState } from "react";
import DualListBox from "react-dual-listbox";
import { Icon } from "@/components/Component";

const ReactDualList = ({ options, icon, canFilter, preSelected }) => {
  const [data, setData] = useState(options);
  const [filterText, setFilterText] = useState("");
  const [selected, setSelected] = useState(preSelected ? preSelected : []);
  const onListChange = (selected) => {
    setSelected(selected);
  };

  // Filtering users by search
  useEffect(() => {
    if (filterText !== "") {
      const filteredObject = options.filter((item) => {
        return item.label.toLowerCase().includes(filterText.toLowerCase());
      });
      setData([...filteredObject]);
    } else {
      setData([...options]);
    }
  }, [filterText, options]);

  return (
    <div className="dual-listbox">
      {canFilter && (
        <input className="dual-listbox__search" placeholder="Search" onChange={(e) => setFilterText(e.target.value)} />
      )}
      <DualListBox
        options={data}
        selected={selected}
        iconsClass={icon ? 'icon' : 'text'}
        onChange={onListChange}
        showHeaderLabels={true}
      ></DualListBox>
    </div>
  );
};

export default ReactDualList;
