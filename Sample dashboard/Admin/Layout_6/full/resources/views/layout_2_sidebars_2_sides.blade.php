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
    <script src="{{URL::asset('assets/js/vendor/visualization/echarts/echarts.min.js')}}"></script>
    <script src="{{URL::asset('assets/js/vendor/maps/echarts/world.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/area_gradient.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/map_europe_effect.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/progress_sortable.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/bars_grouped.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/line_label_marks.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    @include('layouts.navbar')

    <!-- Page content -->
    <div class="page-content">

        @include('layouts.sidebar')

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Inner content -->
            <div class="content-inner">

                @component('components.page-header')
                @slot('title') Home @endslot
                @slot('subtitle') Dashboard @endslot
                @endcomponent

                <!-- Content area -->
                <div class="content container pt-0">

                    <!-- Blocks with chart -->
                    <div class="row">
                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">Total visitors</span>
                                        <h2 class="fw-bold mb-0">5,274 <small class="text-success fs-base fw-normal ms-2">+ 3.6%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_blue" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">New opportunities</span>
                                        <h2 class="fw-bold mb-0">2,785 <small class="text-success fs-base fw-normal ms-2">+ 5.9%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_orange" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">New leads</span>
                                        <h2 class="fw-bold mb-0">1,589 <small class="text-danger fs-base fw-normal ms-2">- 1.8%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_green" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- /blocks with chart -->


                    <!-- Sales by country -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Daily sales by country</h5>
                        </div>

                        <div class="card-body">
                            <div class="row">
                                <div class="col-xl-6">
                                    <div class="map-container map-echarts overflow-hidden rounded mb-3 mb-xl-0" id="map_europe_effect" style="height: 400px;"></div>
                                </div>

                                <div class="col-xl-6">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-pink bg-opacity-10 text-pink lh-1 rounded p-2 me-3">
                                                <i class="ph-shopping-cart"></i>
                                            </span>
                                            <div>
                                                <h6 class="fw-bold mb-0">1,890</h6>
                                                <span class="text-muted">Total sales</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-teal bg-opacity-10 text-teal lh-1 rounded p-2 me-3">
                                                <i class="ph-currency-eur"></i>
                                            </span>
                                            <div>
                                                <h6 class="fw-bold mb-0">€11,781</h6>
                                                <span class="text-muted">Total revenue</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="progress_bar_sorted" style="height: 333px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- /sales by country -->


                    <!-- Latest orders -->
                    <div class="card">
                        <div class="card-header d-flex py-0">
                            <h5 class="py-3 mb-0">Latest orders</h5>

                            <div class="d-inline-flex align-items-center ms-auto">
                                <span class="badge bg-success fw-semibold">29 new</span>
                                <div class="dropdown ms-2">
                                    <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                        <i class="ph-dots-three-vertical"></i>
                                    </button>

                                    <div class="dropdown-menu dropdown-menu-end">
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-eye me-2"></i>
                                            View report
                                        </a>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-printer me-2"></i>
                                            Print report
                                        </a>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-file-pdf me-2"></i>
                                            Export report
                                        </a>
                                        <div class="dropdown-divider"></div>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-gear me-2"></i>
                                            Configure
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="table text-nowrap">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Delivery date</th>
                                        <th>Delivery method</th>
                                        <th>Status</th>
                                        <th class="text-center" style="width: 20px;"><i class="ph-arrow-circle-down"></i></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/klm.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">KLM Royal Dutch Airlines</a>
                                                    <div class="text-muted fs-sm">May 21st</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 12th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/ups.svg')}}" class="me-1" width="20" alt=""> UPS Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/amazon.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Amazon Inc.</a>
                                                    <div class="text-muted fs-sm">May 22nd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 13th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/deutsche-post.svg')}}" class="rounded-sm me-1" width="20" alt=""> Deutsche post</td>
                                        <td><span class="badge bg-danger bg-opacity-10 text-danger">Delayed</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/honda.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Honda Motor Company</a>
                                                    <div class="text-muted fs-sm">May 22nd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 14th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/postnl.svg')}}" class="me-1" width="20" alt=""> PostNL</td>
                                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">Processing</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/holiday-inn.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Holiday Inn Hotels</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 15th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/fedex.svg')}}" class="rounded-sm me-1" width="20" alt=""> Fedex Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/apple.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Apple Inc.</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 16th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/deutsche-post.svg')}}" class="rounded-sm me-1" width="20" alt=""> Deutsche post</td>
                                        <td><span class="badge bg-indigo bg-opacity-10 text-indigo">Dispatched</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/debijenkorf.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">de Bijenkorf</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 17th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/tnt.svg')}}" class="rounded-sm me-1" width="20" alt=""> TNT</td>
                                        <td><span class="badge bg-indigo bg-opacity-10 text-indigo">Dispatched</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/texaco.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Texaco Inc.</a>
                                                    <div class="text-muted fs-sm">May 24th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 18th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/dpd.svg')}}" class="me-1" width="20" alt=""> DPD</td>
                                        <td><span class="badge bg-danger bg-opacity-10 text-danger">Delayed</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Royal Dutch Shell</a>
                                                    <div class="text-muted fs-sm">May 25th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 19th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/ups.svg')}}" class="me-1" width="20" alt=""> UPS Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Tesla Inc.</a>
                                                    <div class="text-muted fs-sm">May 26th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 21st</td>
                                        <td><img src="{{URL::asset('assets/images/brands/dpd.svg')}}" class="me-1" width="20" alt=""> DPD</td>
                                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">Processing</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <!-- /latest orders -->


                    <!-- Reports -->
                    <div class="row">
                        <div class="col-xl-6">

                            <!-- Annual sales report -->
                            <div class="card">
                                <div class="card-header d-flex py-0">
                                    <h6 class="py-3 mb-0">Annual sales report</h6>

                                    <div class="dropdown align-self-center ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="card-body">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-primary bg-opacity-10 text-primary lh-1 rounded p-2 me-3">
                                                <i class="ph-stack"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">4,485</h6>
                                                <span class="text-muted">Campaigns</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-success bg-opacity-10 text-success lh-1 rounded p-2 me-3">
                                                <i class="ph-user-switch"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">1,255</h6>
                                                <span class="text-muted">Leads</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="bars_grouped" style="height: 333px;"></div>
                                    </div>
                                </div>

                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Campaign</th>
                                                <th>Leads</th>
                                                <th>Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        April campaign
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>4,890</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        0.25%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Flash sale
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>1,896</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        1.2%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Up to 40% off
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>2,880</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        0.59%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Extended trial version
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>982</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        1.05%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        50% off second license
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>3,780</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        0.58%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        50% off second license
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>4,551</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        1.04%
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <!-- /annual sales report -->

                        </div>

                        <div class="col-xl-6">

                            <!-- Daily visitors report -->
                            <div class="card">
                                <div class="card-header d-flex py-0">
                                    <h6 class="py-3 mb-0">Daily visitors report</h6>

                                    <div class="dropdown align-self-center ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="card-body">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-indigo bg-opacity-10 text-indigo lh-1 rounded p-2 me-3">
                                                <i class="ph-user-circle-plus"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">4,782</h6>
                                                <span class="text-muted">New users</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-indigo bg-opacity-10 text-indigo lh-1 rounded p-2 me-3">
                                                <i class="ph-user-switch"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">6,478</h6>
                                                <span class="text-muted">Returned</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="line_label_marks" style="height: 333px;"></div>
                                    </div>
                                </div>

                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Browser</th>
                                                <th>Diff</th>
                                                <th>Count</th>
                                                <th>Share</th>

                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/chrome.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Chrome
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        4.84%
                                                    </div>
                                                </td>
                                                <td>728</td>
                                                <td>34.6%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/firefox.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Firefox
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        0.89%
                                                    </div>
                                                </td>
                                                <td>550</td>
                                                <td>20.4%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/edge.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Edge
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        2.86%
                                                    </div>
                                                </td>
                                                <td>458</td>
                                                <td>15.5%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/safari.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Safari
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        1.5%
                                                    </div>
                                                </td>
                                                <td>690</td>
                                                <td>12.5%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/opera.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Opera
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        2.45%
                                                    </div>
                                                </td>
                                                <td>886</td>
                                                <td>10.2%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <!-- /daily visitors report -->

                        </div>
                    </div>
                    <!-- /reports -->

                </div>
                <!-- /content area -->

                @include('layouts.footer')

            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

        <!-- Right sidebar -->
        <div class="sidebar sidebar-end sidebar-expand-xl">

            <!-- Expand button -->
            <button type="button" class="btn btn-sidebar-expand sidebar-control sidebar-end-toggle h-100">
                <i class="ph-caret-left"></i>
            </button>
            <!-- /expand button -->


            <!-- Sidebar content -->
            <div class="sidebar-content">

                <!-- Header -->
                <div class="sidebar-section sidebar-section-body d-flex align-items-center pb-0">
                    <h5 class="mb-0">Sidebar</h5>
                    <div class="ms-auto">
                        <button type="button" class="btn btn-light border-transparent btn-icon rounded-pill btn-sm sidebar-control sidebar-end-toggle d-none d-xl-inline-flex">
                            <i class="ph-arrows-left-right"></i>
                        </button>

                        <button type="button" class="btn btn-light border-transparent btn-icon rounded-pill btn-sm sidebar-mobile-end-toggle d-xl-none">
                            <i class="ph-x"></i>
                        </button>
                    </div>
                </div>
                <!-- /header -->


                <!-- Sidebar search -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Sidebar search</span>
                        <div class="ms-auto">
                            <a href="#sidebar-search" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-search">
                        <div class="sidebar-section-body">
                            <div class="form-control-feedback form-control-feedback-end">
                                <input type="search" class="form-control" placeholder="Search">
                                <div class="form-control-feedback-icon">
                                    <i class="ph-magnifying-glass opacity-50"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /sidebar search -->


                <!-- Actions -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Actions</span>
                        <div class="ms-auto">
                            <a href="#sidebar-actions" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-actions">
                        <div class="sidebar-section-body">
                            <div class="row row-tile g-0">
                                <div class="col">
                                    <button type="button" class="btn btn-light w-100 flex-column rounded-0 rounded-top-start py-2">
                                        <i class="ph-app-store-logo text-primary ph-2x mb-1"></i>
                                        App store
                                    </button>

                                    <button type="button" class="btn btn-light w-100 flex-column rounded-0 rounded-bottom-start py-2">
                                        <i class="ph-twitter-logo text-info ph-2x mb-1"></i>
                                        Twitter
                                    </button>
                                </div>

                                <div class="col">
                                    <button type="button" class="btn btn-light w-100 flex-column rounded-0 rounded-top-end py-2">
                                        <i class="ph-dribbble-logo text-pink ph-2x mb-1"></i>
                                        Dribbble
                                    </button>

                                    <button type="button" class="btn btn-light w-100 flex-column rounded-0 rounded-bottom-end py-2">
                                        <i class="ph-spotify-logo text-success ph-2x mb-1"></i>
                                        Spotify
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /actions -->


                <!-- Sub navigation -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Navigation</span>
                        <div class="ms-auto">
                            <a href="#sidebar-navigation" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-navigation">
                        <ul class="nav nav-sidebar my-2" data-nav-type="accordion">
                            <li class="nav-item-header opacity-50">Actions</li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-plus-circle me-3"></i>
                                    Create task
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-circles-three-plus me-3"></i>
                                    Create project
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-pencil me-3"></i>
                                    Edit task list
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-user-plus me-3"></i>
                                    Assign users
                                    <span class="badge bg-primary rounded-pill ms-auto">94 online</span>
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-users-three me-3"></i>
                                    Create team
                                </a>
                            </li>
                            <li class="nav-item-header opacity-50">Navigate</li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-kanban me-3"></i>
                                    All tasks
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-file-plus"></i>
                                    Active tasks
                                    <span class="badge bg-dark rounded-pill ms-auto">28</span>
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-file-x me-3"></i>
                                    Closed tasks
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-user-focus me-3"></i>
                                    Assigned to me
                                    <span class="badge bg-info rounded-pill ms-auto">86</span>
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-folder-user me-3"></i>
                                    Assigned to my team
                                    <span class="badge bg-danger rounded-pill ms-auto">47</span>
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link">
                                    <i class="ph-gear me-3"></i>
                                    Settings
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
                <!-- /sub navigation -->


                <!-- Online users -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Users online</span>
                        <div class="ms-auto">
                            <a href="#sidebar-users" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-users">
                        <div class="sidebar-section-body">
                            <div class="d-flex mb-3">
                                <a href="#" class="me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face1.jpg')}}" width="36" height="36" class="rounded-pill" alt="">
                                </a>
                                <div class="flex-fill">
                                    <a href="#" class="fw-semibold">James Alexander</a>
                                    <div class="fs-sm opacity-50">Santa Ana, CA.</div>
                                </div>
                                <div class="ms-3 align-self-center">
                                    <div class="bg-success border-success rounded-pill p-1"></div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <a href="#" class="me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face2.jpg')}}" width="36" height="36" class="rounded-pill" alt="">
                                </a>
                                <div class="flex-fill">
                                    <a href="#" class="fw-semibold">Jeremy Victorino</a>
                                    <div class="fs-sm opacity-50">Dowagiac, MI.</div>
                                </div>
                                <div class="ms-3 align-self-center">
                                    <div class="bg-danger border-danger rounded-pill p-1"></div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <a href="#" class="me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face3.jpg')}}" width="36" height="36" class="rounded-pill" alt="">
                                </a>
                                <div class="flex-fill">
                                    <a href="#" class="fw-semibold">Margo Baker</a>
                                    <div class="fs-sm opacity-50">Kasaan, AK.</div>
                                </div>
                                <div class="ms-3 align-self-center">
                                    <div class="bg-success border-success rounded-pill p-1"></div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <a href="#" class="me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face4.jpg')}}" width="36" height="36" class="rounded-pill" alt="">
                                </a>
                                <div class="flex-fill">
                                    <a href="#" class="fw-semibold">Beatrix Diaz</a>
                                    <div class="fs-sm opacity-50">Neenah, WI.</div>
                                </div>
                                <div class="ms-3 align-self-center">
                                    <div class="bg-warning border-warning rounded-pill p-1"></div>
                                </div>
                            </div>

                            <div class="d-flex">
                                <a href="#" class="me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face5.jpg')}}" width="36" height="36" class="rounded-pill" alt="">
                                </a>
                                <div class="flex-fill">
                                    <a href="#" class="fw-semibold">Richard Vango</a>
                                    <div class="fs-sm opacity-50">Grapevine, TX.</div>
                                </div>
                                <div class="ms-3 align-self-center">
                                    <div class="bg-secondary border-secondary rounded-pill p-1"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /online-users -->


                <!-- Filter -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Filters</span>
                        <div class="ms-auto">
                            <a href="#sidebar-filters" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-filters">
                        <div class="sidebar-section-body">
                            <label class="form-check form-check-reverse text-start mb-2">
                                <input type="checkbox" class="form-check-input" checked>
                                <span class="form-check-label">Canon</span>
                            </label>

                            <label class="form-check form-check-reverse text-start mb-2">
                                <input type="checkbox" class="form-check-input">
                                <span class="form-check-label">Nikon</span>
                            </label>

                            <label class="form-check form-check-reverse text-start mb-2">
                                <input type="checkbox" class="form-check-input" checked>
                                <span class="form-check-label">Sony</span>
                            </label>

                            <label class="form-check form-check-reverse text-start mb-2">
                                <input type="checkbox" class="form-check-input" checked>
                                <span class="form-check-label">Fuji</span>
                            </label>

                            <label class="form-check form-check-reverse text-start">
                                <input type="checkbox" class="form-check-input">
                                <span class="form-check-label">Leica</span>
                            </label>
                        </div>
                    </div>
                </div>
                <!-- /filter -->


                <!-- Latest updates -->
                <div class="sidebar-section">
                    <div class="sidebar-section-header border-bottom">
                        <span class="fw-semibold">Latest updates</span>
                        <div class="ms-auto">
                            <a href="#sidebar-updates" class="text-reset" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator"></i>
                            </a>
                        </div>
                    </div>

                    <div class="collapse show" id="sidebar-updates">
                        <div class="sidebar-section-body">
                            <div class="d-flex mb-3">
                                <div class="me-3">
                                    <div class="bg-primary bg-opacity-10 text-primary lh-1 rounded-pill p-2">
                                        <i class="ph-git-pull-request"></i>
                                    </div>
                                </div>

                                <div class="flex-fill">
                                    Drop the IE <a href="#">specific hacks</a> for temporal inputs
                                    <div class="fs-sm opacity-50">4 minutes ago</div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <div class="me-3">
                                    <div class="bg-warning bg-opacity-10 text-warning lh-1 rounded-pill p-2">
                                        <i class="ph-git-commit"></i>
                                    </div>
                                </div>

                                <div class="flex-fill">
                                    Add full font overrides for popovers and tooltips
                                    <div class="fs-sm opacity-50">36 minutes ago</div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <div class="me-3">
                                    <div class="bg-info bg-opacity-10 text-info lh-1 rounded-pill p-2">
                                        <i class="ph-git-branch"></i>
                                    </div>
                                </div>

                                <div class="flex-fill">
                                    <a href="#">Chris Arney</a> created a new <span class="fw-semibold">Design</span> branch
                                    <div class="fs-sm opacity-50">2 hours ago</div>
                                </div>
                            </div>

                            <div class="d-flex mb-3">
                                <div class="me-3">
                                    <div class="bg-success bg-opacity-10 text-success lh-1 rounded-pill p-2">
                                        <i class="ph-git-merge"></i>
                                    </div>
                                </div>

                                <div class="flex-fill">
                                    <a href="#">Eugene Kopyov</a> merged <span class="fw-semibold">Master</span> and <span class="fw-semibold">Dev</span> branches
                                    <div class="fs-sm opacity-50">Dec 18, 18:36</div>
                                </div>
                            </div>

                            <div class="d-flex">
                                <div class="me-3">
                                    <div class="bg-primary bg-opacity-10 text-primary lh-1 rounded-pill p-2">
                                        <i class="ph-git-pull-request"></i>
                                    </div>
                                </div>

                                <div class="flex-fill">
                                    Have Carousel ignore keyboard events
                                    <div class="fs-sm opacity-50">Dec 12, 05:46</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /latest updates -->

            </div>
            <!-- /sidebar content -->

        </div>
        <!-- /right sidebar -->

    </div>
    <!-- /page content -->

    @include('layouts.notification')

    @include('layouts.right-sidebar')


</body>
</html>
