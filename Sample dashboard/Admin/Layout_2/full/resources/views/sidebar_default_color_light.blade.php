<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>Limitless - Responsive Web Application Kit by Themesbrand</title>

    <!-- Global stylesheets -->
    <link href="{{URL::asset('assets/fonts/inter/inter.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/icons/phosphor/styles.min.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/css/all.min.css')}}" id="stylesheet" rel="stylesheet" type="text/css">
    <!-- /global stylesheets -->

    <!-- Core JS files -->
    <script src="{{URL::asset('assets/demo/demo_configurator.js')}}"></script>
    <script src="{{URL::asset('assets/js/bootstrap/bootstrap.bundle.min.js')}}"></script>
    <!-- /core JS files -->

    <!-- Theme JS files -->
    <script src="{{URL::asset('assets/js/vendor/ui/prism.min.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    <!-- Page content -->
    <div class="page-content">

        <!-- Main sidebar -->
        <div class="sidebar sidebar-main sidebar-expand-lg">

            <!-- Sidebar header -->
            <div class="sidebar-section border-bottom">
                <div class="sidebar-logo d-flex justify-content-center align-items-center">
                    <a href="index" class="d-inline-flex align-items-center py-2">
                        <img src="{{URL::asset('assets/images/logo_icon.svg')}}" class="sidebar-logo-icon" alt="">
                        <img src="{{URL::asset('assets/images/logo_text_dark.svg')}}" class="sidebar-resize-hide ms-3" height="14" alt="">
                    </a>

                    <div class="sidebar-resize-hide ms-auto">
                        <button type="button" class="btn btn-light btn-icon btn-sm rounded-pill border-transparent sidebar-control sidebar-main-resize d-none d-lg-inline-flex">
                            <i class="ph-arrows-left-right"></i>
                        </button>

                        <button type="button" class="btn btn-light btn-icon btn-sm rounded-pill border-transparent sidebar-mobile-main-toggle d-lg-none">
                            <i class="ph-x"></i>
                        </button>
                    </div>
                </div>
            </div>
            <!-- /sidebar header -->


            <!-- Sidebar content -->
            <div class="sidebar-content">

                <!-- Customers -->
                <div class="sidebar-section sidebar-resize-hide dropdown mx-2">
                    <a href="#" class="btn btn-link text-body text-start lh-1 dropdown-toggle p-2 my-1 w-100" data-bs-toggle="dropdown">
                        <div class="hstack gap-2 flex-grow-1 my-1">
                            <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="w-32px h-32px" alt="">
                            <div class="me-auto">
                                <div class="fs-sm text-body opacity-75 mb-1">Customer</div>
                                <div class="fw-semibold">Royal Dutch Shell</div>
                            </div>
                        </div>
                    </a>

                    <div class="dropdown-menu w-100">
                        <a href="#" class="dropdown-item hstack gap-2 py-2">
                            <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="w-32px h-32px" alt="">
                            <div>
                                <div class="fw-semibold">Tesla Motors Inc</div>
                                <div class="fs-sm text-muted">42 users</div>
                            </div>
                        </a>
                        <a href="#" class="dropdown-item hstack gap-2 py-2">
                            <img src="{{URL::asset('assets/images/brands/debijenkorf.svg')}}" class="w-32px h-32px" alt="">
                            <div>
                                <div class="fw-semibold">De Bijenkorf</div>
                                <div class="fs-sm text-muted">49 users</div>
                            </div>
                        </a>
                        <a href="#" class="dropdown-item hstack gap-2 py-2">
                            <img src="{{URL::asset('assets/images/brands/klm.svg')}}" class="w-32px h-32px" alt="">
                            <div>
                                <div class="fw-semibold">Royal Dutch Airlines</div>
                                <div class="fs-sm text-muted">18 users</div>
                            </div>
                        </a>
                        <a href="#" class="dropdown-item hstack gap-2 active py-2">
                            <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="w-32px h-32px" alt="">
                            <div>
                                <div class="fw-semibold">Royal Dutch Shell</div>
                                <div class="fs-sm text-muted">54 users</div>
                            </div>
                        </a>
                        <a href="#" class="dropdown-item hstack gap-2 py-2">
                            <img src="{{URL::asset('assets/images/brands/bp.svg')}}" class="w-32px h-32px" alt="">
                            <div>
                                <div class="fw-semibold">BP plc</div>
                                <div class="fs-sm text-muted">23 users</div>
                            </div>
                        </a>
                    </div>
                </div>
                <!-- /customers -->


                <!-- Main navigation -->
                <div class="sidebar-section">
                    <ul class="nav nav-sidebar" id="navbar-nav" data-nav-type="accordion">

                        <!-- Main -->
                        <li class="nav-item-header">
                            <div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Main</div>
                            <i class="ph-dots-three sidebar-resize-show"></i>
                        </li>
                        <li class="nav-item">
                            <a href="index" class="nav-link">
                                <i class="ph-house"></i>
                                <span>
                                    Dashboard
                                    <span class="d-block fw-normal opacity-50">No pending orders</span>
                                </span>
                            </a>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">
                                <i class="ph-swatches"></i>
                                <span>Themes</span>
                            </a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="index" class="nav-link active">Default</a></li>
                                <li class="nav-item"><a href="javascript:void(0)" class="nav-link disabled">Material <span class="badge align-self-center ms-auto">Coming soon</span></a></li>
                                <li class="nav-item"><a href="javascript:void(0)" class="nav-link disabled">Clean <span class="badge align-self-center ms-auto">Coming soon</span></a></li>
                            </ul>
                        </li>
                        <li class="nav-item">
                            <a href="javascript:void(0)" class="nav-link">
                                <i class="ph-list-numbers"></i>
                                <span>Changelog</span>
                                <span class="badge bg-primary align-self-center rounded-pill ms-auto">4.0</span>
                            </a>
                        </li>

                        <!-- Layout -->
                        <li class="nav-item-header">
                            <div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Layout</div>
                            <i class="ph-dots-three sidebar-resize-show"></i>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">
                                <i class="ph-layout"></i>
                                <span>Page layouts</span>
                            </a>

                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="layout_static" class="nav-link">Static layout</a></li>
                                <li class="nav-item"><a href="layout_no_header" class="nav-link">No header</a></li>
                                <li class="nav-item"><a href="layout_no_footer" class="nav-link">No footer</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="layout_fixed_header" class="nav-link">Fixed header</a></li>
                                <li class="nav-item"><a href="layout_fixed_footer" class="nav-link">Fixed footer</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="layout_2_sidebars_1_side" class="nav-link">2 sidebars on 1 side</a></li>
                                <li class="nav-item"><a href="layout_2_sidebars_2_sides" class="nav-link">2 sidebars on 2 sides</a></li>
                                <li class="nav-item"><a href="layout_3_sidebars" class="nav-link">3 sidebars</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="layout_boxed_page" class="nav-link">Boxed page</a></li>
                                <li class="nav-item"><a href="layout_boxed_content" class="nav-link">Boxed content</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu  nav-item-expanded">
                            <a href="#" class="nav-link">
                                <i class="ph-columns"></i>
                                <span>Sidebars</span>
                            </a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item nav-item-submenu  nav-item-expanded nav-item-open">
                                    <a href="#" class="nav-link">Main sidebar</a>
                                    <ul class="nav-group-sub collapse show">
                                        <li class="nav-item"><a href="sidebar_default_resizable" class="nav-link">Resizable</a></li>
                                        <li class="nav-item"><a href="sidebar_default_resized" class="nav-link">Resized</a></li>
                                        <li class="nav-item"><a href="sidebar_default_collapsible" class="nav-link">Collapsible</a></li>
                                        <li class="nav-item"><a href="sidebar_default_collapsed" class="nav-link">Collapsed</a></li>
                                        <li class="nav-item"><a href="sidebar_default_hideable" class="nav-link">Hideable</a></li>
                                        <li class="nav-item"><a href="sidebar_default_hidden" class="nav-link">Hidden</a></li>
                                        <li class="nav-item-divider"></li>
                                        <li class="nav-item"><a href="sidebar_default_color_light" class="nav-link">Light color</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Secondary sidebar</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="sidebar_secondary_collapsible" class="nav-link">Collapsible</a></li>
                                        <li class="nav-item"><a href="sidebar_secondary_collapsed" class="nav-link">Collapsed</a></li>
                                        <li class="nav-item"><a href="sidebar_secondary_hideable" class="nav-link">Hideable</a></li>
                                        <li class="nav-item"><a href="sidebar_secondary_hidden" class="nav-link">Hidden</a></li>
                                        <li class="nav-item-divider"></li>
                                        <li class="nav-item"><a href="sidebar_secondary_color_dark" class="nav-link">Dark color</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Right sidebar</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="sidebar_right_collapsible" class="nav-link">Collapsible</a></li>
                                        <li class="nav-item"><a href="sidebar_right_collapsed" class="nav-link">Collapsed</a></li>
                                        <li class="nav-item"><a href="sidebar_right_hideable" class="nav-link">Hideable</a></li>
                                        <li class="nav-item"><a href="sidebar_right_hidden" class="nav-link">Hidden</a></li>
                                        <li class="nav-item-divider"></li>
                                        <li class="nav-item"><a href="sidebar_right_color_dark" class="nav-link">Dark color</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Content sidebar</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="sidebar_content_left" class="nav-link">Left aligned</a></li>
                                        <li class="nav-item"><a href="sidebar_content_left_stretch" class="nav-link">Left stretched</a></li>
                                        <li class="nav-item"><a href="sidebar_content_left_sections" class="nav-link">Left sectioned</a></li>
                                        <li class="nav-item"><a href="sidebar_content_right" class="nav-link">Right aligned</a></li>
                                        <li class="nav-item"><a href="sidebar_content_right_stretch" class="nav-link">Right stretched</a></li>
                                        <li class="nav-item"><a href="sidebar_content_right_sections" class="nav-link">Right sectioned</a></li>
                                        <li class="nav-item-divider"></li>
                                        <li class="nav-item"><a href="sidebar_content_color_dark" class="nav-link">Dark color</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Sticky areas</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="sidebar_sticky_header" class="nav-link">Header</a></li>
                                        <li class="nav-item"><a href="sidebar_sticky_footer" class="nav-link">Footer</a></li>
                                        <li class="nav-item"><a href="sidebar_sticky_header_footer" class="nav-link">Header and footer</a></li>
                                        <li class="nav-item"><a href="sidebar_sticky_custom" class="nav-link">Custom elements</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item"><a href="sidebar_components" class="nav-link">Sidebar components</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">
                                <i class="ph-rows"></i>
                                <span>Navbars</span>
                            </a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Single navbar</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="navbar_single_bottom_fixed" class="nav-link">Bottom fixed</a></li>
                                        <li class="nav-item"><a href="navbar_single_header_before" class="nav-link">Before page header</a></li>
                                        <li class="nav-item"><a href="navbar_single_header_before_fixed" class="nav-link">Before page header fixed</a></li>
                                        <li class="nav-item"><a href="navbar_single_header_after" class="nav-link">After page header</a></li>
                                        <li class="nav-item"><a href="navbar_single_header_after_sticky" class="nav-link">After page header sticky</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Multiple navbars</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="navbar_multiple_top_static" class="nav-link">Top static</a></li>
                                        <li class="nav-item"><a href="navbar_multiple_top_fixed" class="nav-link">Top fixed</a></li>
                                        <li class="nav-item"><a href="navbar_multiple_bottom_static" class="nav-link">Bottom static</a></li>
                                        <li class="nav-item"><a href="navbar_multiple_bottom_fixed" class="nav-link">Multiple bottom fixed</a></li>
                                        <li class="nav-item"><a href="navbar_multiple_top_bottom_fixed" class="nav-link">Top and bottom fixed</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Content navbar</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="navbar_component_single" class="nav-link">Single navbar</a></li>
                                        <li class="nav-item"><a href="navbar_component_multiple" class="nav-link">Multiple navbars</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="navbar_colors" class="nav-link">Color options</a></li>
                                <li class="nav-item"><a href="navbar_sizes" class="nav-link">Sizing options</a></li>
                                <li class="nav-item"><a href="navbar_components" class="nav-link">Navbar components</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">
                                <i class="ph-arrow-fat-lines-down"></i>
                                <span>Vertical navigation</span>
                            </a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="navigation_vertical_styles" class="nav-link">Navigation styles</a></li>
                                <li class="nav-item"><a href="navigation_vertical_collapsible" class="nav-link">Collapsible menu</a></li>
                                <li class="nav-item"><a href="navigation_vertical_accordion" class="nav-link">Accordion menu</a></li>
                                <li class="nav-item"><a href="navigation_vertical_bordered" class="nav-link">Bordered navigation</a></li>
                                <li class="nav-item"><a href="navigation_vertical_right_icons" class="nav-link">Right icons</a></li>
                                <li class="nav-item"><a href="navigation_vertical_badges" class="nav-link">Badges</a></li>
                                <li class="nav-item"><a href="navigation_vertical_disabled" class="nav-link">Disabled items</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">
                                <i class="ph-arrow-fat-lines-right"></i>
                                <span>Horizontal navigation</span>
                            </a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="navigation_horizontal_styles" class="nav-link">Navigation styles</a></li>
                                <li class="nav-item"><a href="navigation_horizontal_elements" class="nav-link">Navigation elements</a></li>
                                <li class="nav-item"><a href="navigation_horizontal_tabs" class="nav-link">Tabbed navigation</a></li>
                                <li class="nav-item"><a href="navigation_horizontal_disabled" class="nav-link">Disabled navigation links</a></li>
                                <li class="nav-item"><a href="navigation_horizontal_mega" class="nav-link">Horizontal mega menu</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link"><i class="ph-arrow-elbow-down-right"></i> <span>Menu levels</span></a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Second level with child</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
                                        <li class="nav-item nav-item-submenu">
                                            <a href="#" class="nav-link">Third level with child</a>
                                            <ul class="nav-group-sub collapse">
                                                <li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
                                                <li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
                                            </ul>
                                        </li>
                                        <li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
                            </ul>
                        </li>
                        <!-- /layout -->

                    </ul>
                </div>
                <!-- /main navigation -->

            </div>
            <!-- /sidebar content -->


            <!-- Upgrade plan block -->
            <div class="alert bg-primary bg-opacity-10 sidebar-resize-hide rounded p-3 m-3">
                <div class="d-flex mb-2">
                    <div class="d-inline-flex bg-primary bg-opacity-10 lh-1 rounded-pill p-2">
                        <i class="ph-lock-key-open"></i>
                    </div>
                    <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
                </div>
                <div class="mb-2">
                    Upgrade to <span class="fw-bold">Pro plan</span> to unlock all available features
                </div>
                <a href="#" class="d-inline-flex align-items-center mt-1">
                    Upgrade now
                    <i class="ph-arrow-circle-right ms-2"></i>
                </a>
            </div>
            <!-- /upgrade plan block -->

        </div>
        <!-- /main sidebar -->

        <!-- Main content -->
        <div class="content-wrapper">

            @include('layouts.navbar')

            <!-- Inner content -->
            <div class="content-inner">

                @component('components.breadcrumb')
                @slot('title') Sidebars @endslot
                @slot('subtitle') Default Light @endslot
                @endcomponent

                <!-- Content area -->
                <div class="content pt-0">

                    <!-- Info alert -->
                    <div class="alert alert-success alert-dismissible">
                        <div class="alert-heading fw-semibold">Light main sidebar</div>
                        All sidebars support light and dark color palettes. By default main sidebar is dark, if you want to make it white, remove <code>.sidebar-dark</code> class from sidebar container. Some text color adjustments might be needed.
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                    <!-- /info alert -->


                    <!-- Sidebars overview -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Sidebars overview</h5>
                        </div>

                        <div class="card-body">
                            <p class="mb-3">Sidebar - vertical area that displays onscreen and presents widget components and website navigation menu in a text-based hierarchical form. All sidebars are css-driven - just add one of css classes to the <code>.sidebar</code> container, and sidebar will change its width and color. No js, css only. Although sidebar type is based on css, buttons do their job with JS - they switch necessary classes in <code>.sidebar</code> container. Below you'll find summarized tables with all available <code>button</code> and <code>sidebar</code> container classes. By default, the template includes 6 different sidebar types and combinations:</p>

                            <div class="mb-3">
                                <h6>1. Default sidebar</h6>
                                <p>Default template sidebar has <code>300px</code> (~18.75rem) width, aligned to the left (to the right in RTL version) and has dark blue background color. All navigation levels are based on accordion <strong>or</strong> collapsible functionality, open on click. Supports 2 versions: fixed (default) and static (in static layout only). Both versions use default browser scrollbars, but support custom scrollbars such as <code>perfect scrollbar</code> component.</p>
                            </div>

                            <div class="mb-3">
                                <h6>2. Mini sidebar</h6>
                                <p>Mini sidebar has <code>56px</code> width, which is calculated dynamically (icon size + double padding). No text in parent level of menu items, aligned to the left (to the right in RTL version) and has dark blue background color. Sidebar changes the width on hover, no additional changes. It is <strong>required</strong> to add <code>.sidebar-main-resized</code> class to the <code>.sidebar</code> container if you want to have it collapsed by default. This class is responsible for sidebar width and main navigation. By default all components except main navigation are hidden in mini sidebar. Can be used with main sidebar only.</p>
                            </div>

                            <div class="mb-3">
                                <h6>3. Secondary sidebar</h6>
                                <p>Main sidebar has <code>300px</code> width or <code>56px</code> (if <code>.sidebar-main-resized</code> class added). Secondary sidebar has the same fixed width of <code>300px</code>, which is similar to default and right sidebars, so different sidebar components can be placed to all sidebar types. Main and secondary sidebars can contain any content - menu, navigation, buttons, lists, tabs etc. Secondary sidebar can be either collapsed or hidden.</p>
                            </div>

                            <div class="mb-3">
                                <h6>4. Right sidebar</h6>
                                <p>Right sidebar layout includes additional sidebar displayed on the right (left in RTL direction) side. It is displayed as an additional component with 100% height, similar to other sidebars. Right sidebar is visible by default, but can be collapsed or hidden.</p>
                            </div>

                            <div class="mb-3">
                                <h6>5. Right/Secondary sidebars</h6>
                                <p>Secondary and Right sidebars can be used together, so basically it is a 4 column layout. The width of any sidebar doesn't affect other layout columns, they all have independent width controls. Refer to the table below for more information.</p>
                            </div>

                            <div class="mb-3">
                                <h6>6. Content (component) sidebar</h6>
                                <p>Usually sidebar is not a part of content and mainly used for navigation. Limitless allows you to use sidebar outside and inside content area. Content sidebar isn't based on grid and has the same width as other sidebars, this means all sidebar components can be placed inside content sidebar. Supports left and right positioning and can be either stretched to fill all available height or height that depends on sidebar content height.</p>
                            </div>
                        </div>
                    </div>
                    <!-- /sidebars overview -->


                    <!-- Button classes -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Button classes</h5>
                        </div>

                        <div class="card-body">
                            <h6>Overview</h6>
                            <p class="mb-3">This table displays all optional <code>button</code> classes, responsible for the sidebar appearance. Depending on the sidebar type, add one of these classes to any button or link and this element will handle sidebar control. Multiple controls are also available - add as many sidebar controls as you wish. Please note: these classes don't change sidebar markup, only CSS rules.</p>
                            <div class="table-responsive border rounded mb-4">
                                <table class="table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="border-top-0" style="width: 300px;">Button class</th>
                                            <th class="border-top-0">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>.sidebar-main-resize</code></td>
                                            <td>Resizable sidebar. Changes main sidebar width from default to mini. This button is added to all pages by default.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-toggle</code></td>
                                            <td>Collapses/expands and/or hides/shows <code>main</code> sidebar. Used mostly in dual sidebar type to hide main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end-toggle</code></td>
                                            <td>Toggles right sidebar - if right sidebar is shown, main sidebar width remains the same, whether it's in default or mini mode.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary-toggle</code></td>
                                            <td>Hides/shows or collapses/expands <code>secondary</code> sidebar. Secondary sidebar supports only toggle functionality and always has fixed width of <code>300px</code>.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component-toggle</code></td>
                                            <td>Hides/shows <code>content</code> sidebars. Content sidebars aren't connected with other sidebars, so this is the only button that controls their visibility.</td>
                                        </tr>
                                        <tr class="border-top-width-2">
                                            <td><code>.sidebar-mobile-main-toggle</code></td>
                                            <td>Toggles <code>main</code> sidebar on mobile - slides from left to right.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-secondary-toggle</code></td>
                                            <td>Toggles <code>secondary</code> sidebar on mobile - slides from left to right.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-end-toggle</code></td>
                                            <td>Toggles <code>right</code> sidebar on mobile - slides from right to left.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-component-toggle</code></td>
                                            <td>Toggles <code>content</code> sidebar on mobile - has full width by default, has no animation.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h6>Example Markup</h6>
                            <p>Default placement of sidebar control buttons is sidebar header:</p>
                            <pre class="language-markup mb-3" data-line="13-19">
								<code>
									&lt;!-- Main sidebar -->
									&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg">

										&lt;!-- Sidebar content -->
										&lt;div class="sidebar-content">

											&lt;!-- Header -->
											&lt;div class="sidebar-section">
												&lt;div class="sidebar-section-body d-flex justify-content-center">
													&lt;h6 class="sidebar-resize-hide flex-grow-1 my-auto">Navigation&lt;/h6>

													&lt;div>
														&lt;button type="button" class="[button classes]">
															&lt;i class="ph-arrows-left-right">&lt;/i>
														&lt;/button>

														&lt;button type="button" class="[button classes]">
															&lt;i class="ph-x">&lt;/i>
														&lt;/button>
													&lt;/div>
												&lt;/div>
											&lt;/div>
											&lt;!-- /header -->

											[other content]

										&lt;/div>
										&lt;!-- /sidebar content -->

									&lt;/div>
									&lt;!-- /main sidebar -->
								</code>
							</pre>

                            <p>Here is an example of button inside navbar:</p>
                            <pre class="language-markup" data-line="7-9">
								<code>
									&lt;!-- Navbar placement -->
									&lt;div class="navbar navbar-expand navbar-dark">
										&lt;div class="navbar-brand">...&lt;/div>

										&lt;ul class="navbar-nav">
											&lt;li class="nav-item">
												&lt;a href="#" class="navbar-nav-link sidebar-control sidebar-main-toggle">
													&lt;i class="ph-arrows-left-right">&lt;/i>
												&lt;/a>
											&lt;/li>
											...
										&lt;/ul>
									&lt;/div>
									&lt;!-- /navbar placement -->
								</code>
							</pre>
                        </div>
                    </div>
                    <!-- /button classes -->


                    <!-- Sidebar classes -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Sidebar classes</h5>
                        </div>

                        <div class="card-body">
                            <h6>Overview</h6>
                            <p class="mb-3">This table demonstrates all classes for <code>sidebar</code> container, responsible for the sidebar width and color. Almost all of these classes are mandatory, some of them are responsible for proper styling or have a specific code attached to this class (like <code>.sidebar-main</code> class, which has collapsible functionality). All classes can be combined depending on the type of sidebar:</p>
                            <div class="table-responsive border rounded mb-4">
                                <table class="table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="border-top-0" style="width: 300px">Body class</th>
                                            <th class="border-top-0">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>.sidebar</code></td>
                                            <td>Default sidebar class, should be added in all layout types.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main</code></td>
                                            <td>Defines <strong>main</strong> sidebar. Mini sidebar (<code>.sidebar-main-resized</code> class) takes effect only if sidebar has <code>.sidebar-main</code> class. By default, all components except main navigation are hidden in mini sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-resized</code></td>
                                            <td>Defines <strong>main</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary</code></td>
                                            <td>Defines <strong>secondary</strong> sidebar. Has fixed <code>270px</code> width and usually comes after main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary-collapsed</code></td>
                                            <td>Defines <strong>secondary</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end</code></td>
                                            <td>Defines <strong>right</strong> sidebar. Has fixed <code>270px</code> width and appears on the right side from the main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end-collapsed</code></td>
                                            <td>Defines <strong>right</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component</code></td>
                                            <td>This class is required in <strong>content</strong> (or component) sidebar. Also requires <code>.sidebar-component-left</code> or <code>.sidebar-component-right</code> classes for proper spacing.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component-collapsed</code></td>
                                            <td>Defines <strong>content</strong> sidebar in collapsed state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-dark</code></td>
                                            <td>Defines <strong>dark</strong> sidebar. This class can be applied to all sidebar types and positions. This class is also required for custom colors (see below).</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-dark.bg-*</code></td>
                                            <td>Defines sidebar background color. According to the custom color system, sidebar background color can be changed to one of the available colors by adding a proper class to the main sidebar container.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-expand-[breakpoint]</code></td>
                                            <td>This class specifies when sidebar needs to be collapsed, basically when sidebar switches to mobile mode. Breakpoint should always be similar to <strong>navbar</strong> breakpoint for proper matching. Available breakpoints are: xl, lg, md and sm. This class is required.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-unfold</code></td>
                                            <td>This class gets added when user hovers on mini sidebar. It controls resizable behaviour when main sidebar is collapsed. Has no effect on mobile since all sidebars on mobile have same width.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h6>Example Markup</h6>
                            <p>Default left aligned sidebar markup:</p>
                            <pre class="language-markup mb-3" data-line="15">
								<code>
									&lt;!-- Default sidebar layout -->
									&lt;body>

										&lt;!-- Navbar -->
										&lt;div class="navbar navbar-dark navbar-expand-lg">
											...
										&lt;/div>
										&lt;!-- /navbar -->


										&lt;!-- Page container -->
										&lt;div class="page-content">

											&lt;!-- Main sidebar -->
											&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg">
												&lt;div class="sidebar-content">
													...
												&lt;/div>
											&lt;/div>
											&lt;!-- /main sidebar -->

											&lt;!-- Main content -->
											&lt;div class="content-wrapper">
												...
											&lt;/div>
											&lt;!-- /main content -->

										&lt;/div>
										&lt;!-- /page content -->

									&lt;/body>
									&lt;!-- /default sidebar layout -->
								</code>
							</pre>

                            <p>Mini sidebar markup. The only difference is <code>.sidebar-main-resized</code> class:</p>
                            <pre class="language-markup" data-line="15">
								<code>
									&lt;!-- Mini sidebar layout -->
									&lt;body>

										&lt;!-- Navbar -->
										&lt;div class="navbar navbar-dark navbar-expand-lg">
											...
										&lt;/div>
										&lt;!-- /navbar -->


										&lt;!-- Page container -->
										&lt;div class="page-content">

											&lt;!-- Main sidebar -->
											&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg sidebar-main-resized">
												&lt;div class="sidebar-content">
													...
												&lt;/div>
											&lt;/div>
											&lt;!-- /main sidebar -->

											&lt;!-- Main content -->
											&lt;div class="content-wrapper">
												...
											&lt;/div>
											&lt;!-- /main content -->

										&lt;/div>
										&lt;!-- /page content -->

									&lt;/body>
									&lt;!-- /mini sidebar layout -->
								</code>
							</pre>
                        </div>
                    </div>
                    <!-- /sidebar classes -->

                </div>
                <!-- /content area -->

                @include('layouts.footer')

            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->


    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>
