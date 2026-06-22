import React, { useState } from "react";
import DatePicker from "react-datepicker";
import Select from "react-select";
import { Modal, ModalBody,  Col } from "reactstrap";
import { Icon, Button, RSelect } from "@/components/Component";
import { useForm } from "react-hook-form";
import { ColorOptions } from "@/components/partials/color-select-menu/ColorMenu";

const BoardForm = ({ toggle, isOpen, edit }) => {
    const { register, handleSubmit, formState: { errors } } = useForm();

    const themes = [
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
        { value: "info", label: "Info" },
        { value: "danger", label: "Danger" },
        { value: "warning", label: "Warning" },
        { value: "success", label: "Success" },
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
    ];

    const [formData, setFormData] = useState({
        title: "board title",
        color: themes[0],
    });

    return (
        <Modal size="lg" isOpen={isOpen} toggle={toggle}>
            <ModalBody>
                <a href="#cancel" className="close"
                    onClick={(ev) => {
                        ev.preventDefault(); toggle();
                    }}
                >
                    <Icon name="cross-sm"></Icon>
                </a>
                <div className="p-2">
                    <h5 className="title">{edit ? "Update" : "Add"} Board</h5>
                    <div className="mt-4">
                        <form className="row gy-4" onSubmit={(e) => e.preventDefault()}>
                            <Col className="col-12">
                                <div className="form-group">
                                <label className="form-label">Board Title</label>
                                <input
                                    type="text"
                                    {...register('title', { required: "This field is required" })}
                                    value={formData.title}
                                    onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        title: e.target.value,
                                    })
                                    }
                                    className="form-control" />
                                {errors.title && <span className="invalid">{errors.title.message}</span>}
                                </div>
                            </Col>
                            <Col className="col-12">
                                <div className="form-group">
                                    <label className="form-label">Select Color</label>
                                    <div className="form-control-select">
                                        <Select
                                            className="react-select-container"
                                            classNamePrefix="react-select"
                                            formatOptionLabel={ColorOptions}
                                            defaultValue={formData.color}
                                            options={themes}
                                            onChange={(e) => {
                                                setFormData({ ...formData, color: e });
                                            }}
                                        />
                                    </div>
                                </div>
                            </Col>
                            <Col className="col-12">
                                <ul className="align-center flex-wrap flex-sm-nowrap gx-4 gy-2">
                                    <li>
                                        <Button color="primary" size="md" type="submit">
                                        {edit ? "Update" : "Add"} Board
                                        </Button>
                                    </li>
                                    <li>
                                        <Button className="link link-light" 
                                            onClick={(ev) => {
                                                ev.preventDefault(); toggle();
                                            }}
                                        >
                                        Cancel
                                        </Button>
                                    </li>
                                </ul>
                            </Col>
                        </form>
                    </div>
                </div>
            </ModalBody>
        </Modal>
    );
};

export default BoardForm;